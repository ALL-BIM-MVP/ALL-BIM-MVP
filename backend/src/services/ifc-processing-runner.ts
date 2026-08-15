import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pool from "../db/database.js";
import { UPLOADS_DIR } from "../middlewares/upload.midleware.js";

// ------------------------------------------------------------------
// El "worker" real: invoca el pipeline de Python como subprocess,
// lee el JSON normalizado que produce, y lo inserta en la BD dentro
// de una transacción. Nada de esto se espera desde el request HTTP —
// se llama fire-and-forget, el estado final queda escrito en
// ifc_files (status/error_message), que es lo único que el cliente
// puede consultar (GET /api/ifc-files/:id).
// ------------------------------------------------------------------

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/dist/services -> backend/dist -> backend -> raíz del repo
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const PYTHON_BIN = process.env.PROCESSING_PYTHON
    || path.join(REPO_ROOT, "processing", ".venv", "bin", "python");

const NORMA_JSON_PATH = process.env.NORMA_JSON_PATH
    || path.join(REPO_ROOT, "processing", "proceso-metrados-base", "norma_completa.json");

const PROCESSING_TIMEOUT_MS = Number(process.env.PROCESSING_TIMEOUT_MS) || 10 * 60 * 1000; // 10 min
const MAX_CONCURRENT_IFC_JOBS = Number(process.env.MAX_CONCURRENT_IFC_JOBS) || 2;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const EXEC_MAX_BUFFER = 50 * 1024 * 1024; // stdout/stderr del subprocess, NO el JSON (ese va a --out)

// Guarda rápida en memoria — no reemplaza el lock de BD (ver
// ifc-metrados.service.ts), es defensa extra barata contra lanzar dos
// veces el mismo ifc_file_id desde este mismo proceso Node.
export const jobsInFlight = new Set<number>();

// Semáforo simple (contador + cola FIFO) para no lanzar más de
// MAX_CONCURRENT_IFC_JOBS subprocesses de Python a la vez — sin cola de
// mensajería, pero sin dejar que N requests saturen CPU/RAM tampoco.
let runningJobs = 0;
const pendingQueue: Array<() => void> = [];

const acquireSlot = (): Promise<void> => {
    if (runningJobs < MAX_CONCURRENT_IFC_JOBS) {
        runningJobs++;
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        pendingQueue.push(() => {
            runningJobs++;
            resolve();
        });
    });
};

const releaseSlot = (): void => {
    runningJobs--;
    const next = pendingQueue.shift();
    if (next) next();
};

const truncateError = (message: string): string => {
    const cleaned = message.trim() || "Error desconocido procesando el IFC.";
    return cleaned.length > MAX_ERROR_MESSAGE_LENGTH
        ? `${cleaned.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
        : cleaned;
};

const assertPathWithinUploads = (filePath: string): string => {
    const resolved = path.resolve(filePath);
    const uploadsResolved = path.resolve(UPLOADS_DIR);
    if (resolved !== uploadsResolved && !resolved.startsWith(uploadsResolved + path.sep)) {
        throw new Error("Ruta de archivo fuera del directorio de subidas — se rechaza por seguridad.");
    }
    return resolved;
};

const markError = async (ifcFileId: number, rawMessage: string): Promise<void> => {
    await pool.query(
        `UPDATE ifc_files SET status = 'error', error_message = $2 WHERE ifc_file_id = $1`,
        [ifcFileId, truncateError(rawMessage)]
    );
};

// ------------------------------------------------------------------
// Contrato del JSON que produce processing/ifc/cli.py — ver
// processing/ifc/normalize.py para la fuente de verdad.
// ------------------------------------------------------------------
interface PipelineElement {
    express_id: number;
    global_id: string | null;
    tag: string | null;
    ifc_type: string | null;
    name: string | null;
    level_name: string | null;
    space_name: string | null;
}

interface PipelinePropertyDefinition {
    property_set: string;
    property_name: string;
}

interface PipelinePropertyValue {
    property_set: string;
    property_name: string;
    value: string;
}

interface PipelinePropertyRelation {
    express_id: number;
    property_set: string;
    property_name: string;
    value: string;
}

interface PipelinePartida {
    code: string;
    parent_code: string | null;
    description: string;
    unit: string | null;
    sort_order: number;
}

interface PipelineMetradoElement {
    partida_code: string;
    express_id: number;
    // length/width/height = dimensiones brutas de la caja envolvente.
    // run_length = metrado "Longitud" (prioridad revit>geométrico) —
    // NO es lo mismo que length, ver comentario en database/schema.sql.
    length: number | null;
    run_length: number | null;
    width: number | null;
    height: number | null;
    quantity: number | null;
    area: number | null;
    volume: number | null;
    weight: number | null;
}

interface PipelineResult {
    schema_version: string | null;
    elements: PipelineElement[];
    properties: {
        definitions: PipelinePropertyDefinition[];
        values: PipelinePropertyValue[];
        relations: PipelinePropertyRelation[];
    };
    partidas: PipelinePartida[];
    metrado_elements: PipelineMetradoElement[];
}

const UNIT_TO_METRADO_KEY: Partial<Record<string, keyof PipelineMetradoElement>> = {
    m: "run_length", // el metrado de una partida 'm' es la Longitud, no la dimensión bruta "length"
    m2: "area",
    m3: "volume",
    kg: "weight",
};

interface PartidaTotal {
    elementCount: number;
    total: number;
}

// Solo para partidas HOJA (unit != null) — las carpetas/categorías no
// llevan fila en metrado_partida_totals, no hay rollup hacia arriba acá
// (ver comentario en database/schema.sql). total = suma directa de los
// metrado_elements de esa partida, según la columna que corresponde a
// su unidad (m->length, m2->area, m3->volume, kg->weight, el resto
// ->quantity). Nada de "sub_total": ese concepto es de agrupar
// elementos por tag en la vista de detalle, no de esta tabla.
const calcularTotalesPorPartida = (
    partidas: PipelinePartida[],
    metradoElements: PipelineMetradoElement[],
    codeToPartidaId: Map<string, number>
): Map<number, PartidaTotal> => {
    const porCode = new Map(partidas.map((p) => [p.code, p]));

    const acumulado = new Map<string, PartidaTotal>();
    for (const p of partidas) {
        if (p.unit) acumulado.set(p.code, { elementCount: 0, total: 0 });
    }
    for (const me of metradoElements) {
        const partida = porCode.get(me.partida_code);
        const acc = acumulado.get(me.partida_code);
        if (!partida || !acc) continue; // partida sin unit (carpeta) -> no se acumula
        const key = partida.unit ? UNIT_TO_METRADO_KEY[partida.unit] ?? "quantity" : "quantity";
        const valor = me[key];
        acc.total += typeof valor === "number" ? valor : 0;
        acc.elementCount += 1;
    }

    const resultado = new Map<number, PartidaTotal>();
    for (const [code, acc] of acumulado) {
        const partidaId = codeToPartidaId.get(code);
        if (partidaId === undefined) continue;
        resultado.set(partidaId, acc);
    }
    return resultado;
};

// ------------------------------------------------------------------
// Inserción transaccional del resultado — borra lo derivado de un
// procesamiento anterior (si lo había, ej. force=true o reintento) e
// inserta lo nuevo dentro de la MISMA transacción: si algo falla, el
// ROLLBACK deja los datos viejos intactos, nunca queda "ni lo viejo ni
// lo nuevo".
// ------------------------------------------------------------------
const insertarResultado = async (ifcFileId: number, resultado: PipelineResult): Promise<void> => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Los ON DELETE CASCADE del schema se llevan puestos
        // ifc_element_property_values/ifc_property_values (vía
        // ifc_elements/ifc_properties) y metrado_elements/
        // metrado_partida_totals (vía metrado_partidas).
        await client.query(`DELETE FROM ifc_elements WHERE ifc_file_id = $1`, [ifcFileId]);
        await client.query(`DELETE FROM ifc_properties WHERE ifc_file_id = $1`, [ifcFileId]);
        await client.query(`DELETE FROM metrado_partidas WHERE ifc_file_id = $1`, [ifcFileId]);

        const expressIdToElementId = new Map<number, number>();
        for (const el of resultado.elements) {
            const { rows } = await client.query<{ element_id: string }>(
                `INSERT INTO ifc_elements (ifc_file_id, express_id, global_id, tag, ifc_type, name, level_name, space_name)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                RETURNING element_id`,
                [ifcFileId, el.express_id, el.global_id, el.tag, el.ifc_type, el.name, el.level_name, el.space_name]
            );
            expressIdToElementId.set(el.express_id, Number(rows[0]!.element_id));
        }

        const propKeyToId = new Map<string, number>();
        for (const def of resultado.properties.definitions) {
            const { rows } = await client.query<{ property_id: string }>(
                `INSERT INTO ifc_properties (ifc_file_id, property_set, property_name)
                VALUES ($1,$2,$3)
                RETURNING property_id`,
                [ifcFileId, def.property_set, def.property_name]
            );
            propKeyToId.set(`${def.property_set} ${def.property_name}`, Number(rows[0]!.property_id));
        }

        const valueKeyToId = new Map<string, number>();
        for (const val of resultado.properties.values) {
            const propertyId = propKeyToId.get(`${val.property_set} ${val.property_name}`);
            if (propertyId === undefined) continue;
            const { rows } = await client.query<{ value_id: string }>(
                `INSERT INTO ifc_property_values (property_id, value)
                VALUES ($1,$2)
                RETURNING value_id`,
                [propertyId, val.value]
            );
            valueKeyToId.set(`${propertyId} ${val.value}`, Number(rows[0]!.value_id));
        }

        for (const rel of resultado.properties.relations) {
            const elementId = expressIdToElementId.get(rel.express_id);
            const propertyId = propKeyToId.get(`${rel.property_set} ${rel.property_name}`);
            if (elementId === undefined || propertyId === undefined) continue;
            const valueId = valueKeyToId.get(`${propertyId} ${rel.value}`);
            if (valueId === undefined) continue;
            await client.query(
                `INSERT INTO ifc_element_property_values (element_id, property_id, value_id)
                VALUES ($1,$2,$3)
                ON CONFLICT DO NOTHING`,
                [elementId, propertyId, valueId]
            );
        }

        // Shallow-first (por profundidad del código) para resolver
        // parent_id vía un mapa code -> partida_id que se va llenando a
        // medida que se insertan los ancestros.
        const codeToPartidaId = new Map<string, number>();
        const partidasPorProfundidad = [...resultado.partidas].sort(
            (a, b) => a.code.split(".").length - b.code.split(".").length
        );
        for (const p of partidasPorProfundidad) {
            const parentId = p.parent_code ? codeToPartidaId.get(p.parent_code) ?? null : null;
            const { rows } = await client.query<{ partida_id: string }>(
                `INSERT INTO metrado_partidas (ifc_file_id, parent_id, code, description, unit, sort_order)
                VALUES ($1,$2,$3,$4,$5,$6)
                RETURNING partida_id`,
                [ifcFileId, parentId, p.code, p.description, p.unit, p.sort_order]
            );
            codeToPartidaId.set(p.code, Number(rows[0]!.partida_id));
        }

        for (const me of resultado.metrado_elements) {
            const partidaId = codeToPartidaId.get(me.partida_code);
            const elementId = expressIdToElementId.get(me.express_id);
            if (partidaId === undefined || elementId === undefined) continue;
            await client.query(
                `INSERT INTO metrado_elements (partida_id, element_id, length, run_length, width, height, quantity, area, volume, weight)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [partidaId, elementId, me.length, me.run_length, me.width, me.height, me.quantity, me.area, me.volume, me.weight]
            );
        }

        const totales = calcularTotalesPorPartida(resultado.partidas, resultado.metrado_elements, codeToPartidaId);
        for (const [partidaId, t] of totales) {
            await client.query(
                `INSERT INTO metrado_partida_totals (partida_id, element_count, total)
                VALUES ($1,$2,$3)`,
                [partidaId, t.elementCount, t.total]
            );
        }

        await client.query(
            `UPDATE ifc_files
                SET status = 'done', schema_version = $2, processed_at = NOW(), error_message = NULL
            WHERE ifc_file_id = $1`,
            [ifcFileId, resultado.schema_version]
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Dispara el procesamiento de un IFC ya guardado. Se llama
 * fire-and-forget desde ifc-metrados.service.ts — nunca se espera
 * desde el request HTTP. Todo error se resuelve escribiendo
 * status='error' en ifc_files, no hay a quién devolvérselo por HTTP.
 */
export const runIfcProcessing = async (ifcFileId: number, filePath: string): Promise<void> => {
    if (jobsInFlight.has(ifcFileId)) return; // ya está corriendo — no duplicar
    jobsInFlight.add(ifcFileId);

    let resolvedPath: string;
    try {
        resolvedPath = assertPathWithinUploads(filePath);
    } catch (error) {
        jobsInFlight.delete(ifcFileId);
        await markError(ifcFileId, (error as Error).message);
        return;
    }

    await acquireSlot();
    try {
        const tmpOutPath = path.join(os.tmpdir(), `ifc-metrados-${ifcFileId}-${crypto.randomUUID()}.json`);

        try {
            await execFileAsync(PYTHON_BIN, [
                "-m", "processing.ifc.cli",
                resolvedPath,
                "--norma", NORMA_JSON_PATH,
                "--out", tmpOutPath,
            ], {
                cwd: REPO_ROOT,
                timeout: PROCESSING_TIMEOUT_MS,
                maxBuffer: EXEC_MAX_BUFFER,
            });
        } catch (error) {
            const err = error as { killed?: boolean; stderr?: string; message: string };
            const detalle = err.killed
                ? `Tiempo de espera agotado procesando el IFC (${PROCESSING_TIMEOUT_MS}ms).`
                : (err.stderr || err.message);
            console.error(`[ifc-metrados] fallo en subprocess Python (ifc_file_id=${ifcFileId}):`, err.stderr || err.message);
            await markError(ifcFileId, detalle);
            return;
        }

        let resultado: PipelineResult;
        try {
            const raw = await fs.readFile(tmpOutPath, "utf-8");
            resultado = JSON.parse(raw) as PipelineResult;
        } catch (error) {
            console.error(`[ifc-metrados] no se pudo leer/parsear el resultado (ifc_file_id=${ifcFileId}):`, error);
            await markError(ifcFileId, "El procesamiento no devolvió un resultado válido.");
            return;
        } finally {
            await fs.rm(tmpOutPath, { force: true });
        }

        try {
            await insertarResultado(ifcFileId, resultado);
        } catch (error) {
            console.error(`[ifc-metrados] fallo insertando resultado (ifc_file_id=${ifcFileId}):`, error);
            await markError(ifcFileId, (error as Error).message ?? String(error));
        }
    } finally {
        releaseSlot();
        jobsInFlight.delete(ifcFileId);
    }
};

/**
 * Se llama una vez al arrancar el server (index.ts, antes de
 * app.listen): cualquier fila que diga 'processing' en ese momento es
 * necesariamente huérfana (ningún proceso Node vivo la está corriendo
 * todavía tras el reinicio) — se marca 'error' y queda reintentable
 * con el próximo POST.
 */
export const recoverStaleProcessingRows = async (): Promise<void> => {
    const result = await pool.query(
        `UPDATE ifc_files SET status = 'error', error_message = $1 WHERE status = 'processing'`,
        ["Procesamiento interrumpido por reinicio del servidor."]
    );
    if (result.rowCount && result.rowCount > 0) {
        console.warn(`[ifc-metrados] ${result.rowCount} fila(s) en 'processing' marcadas como 'error' tras reinicio del servidor.`);
    }
};
