import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pool from "../db/database.js";
import { UPLOADS_DIR } from "../middlewares/upload.midleware.js";
import type { IfcClassificationSnapshot } from "../models/ifc-classification.models.js";

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
    // Solo para elementos de perfil circular (tubos) — null para todo
    // lo demás, ver comentario en database/schema.sql.
    diameter: number | null;
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

// "quantity" (campo builtin "Und." — ver builtin_field_catalog en
// database/system-data.sql) es EL metrado de una partida 'und', no una
// "cantidad de elementos" — eso es element_count (calculado más abajo,
// nada que ver con esta tabla). Se deja explícito en vez de confiar en
// el fallback ?? "quantity" de más abajo, justamente porque antes esa
// ambigüedad ("¿'quantity' es el metrado o el conteo?") ya causó que
// el catálogo etiquetara este campo como "Cant." por error.
const UNIT_TO_METRADO_KEY: Partial<Record<string, keyof PipelineMetradoElement>> = {
    m: "run_length", // el metrado de una partida 'm' es la Longitud, no la dimensión bruta "length"
    m2: "area",
    m3: "volume",
    kg: "weight",
    und: "quantity",
};

interface PartidaTotal {
    elementCount: number;
    total: number;
}

// Solo para partidas HOJA (unit != null) — las carpetas/categorías no
// llevan fila en metrado_partida_totals, no hay rollup hacia arriba acá
// (ver comentario en database/schema.sql). total = suma directa de los
// metrado_elements de esa partida, según la columna que corresponde a
// su unidad (m->run_length, m2->area, m3->volume, kg->weight,
// und->quantity). Nada de "sub_total": ese concepto es de agrupar
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
// INSERT en lote vía UNNEST — reemplaza el patrón "un INSERT por fila"
// para las 3 tablas donde el volumen real importa (confirmado con
// datos reales del cliente: ifc_element_property_values sola era
// 385,728 INSERTs individuales, ~96.5s de los ~110s totales de esta
// función — ver punto 2 del roadmap). Se batchea en CHUNK_SIZE en vez
// de un solo UNNEST gigante para acotar memoria/tamaño de query, no
// por ningún límite real de Postgres (los arrays de un solo UNNEST no
// tienen el límite de 65535 placeholders que sí tendría un VALUES
// multi-fila armado a mano). ifc_properties/ifc_property_values/
// metrado_partidas/metrado_partida_totals NO se tocan a propósito acá
// — ya son rápidas (<1s combinadas, medido) y metrado_partidas encima
// tiene dependencia jerárquica (parent_id) que complicaría el batching
// sin necesidad real.
const CHUNK_SIZE = 5000;

const chunk = <T>(arr: readonly T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
};

const insertarResultado = async (
    ifcFileId: number, resultado: PipelineResult, classificationSnapshot: IfcClassificationSnapshot
): Promise<void> => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Versionado (Fase 3): esta fila puede ser la versión vigente
        // de su documento, una versión nueva que va a REEMPLAZAR a la
        // vigente, o un reintento de una versión que nunca llegó a ser
        // vigente (status='error' previo) — los tres casos se resuelven
        // igual acá, recién al confirmarse el éxito del procesamiento
        // (nunca antes, ver decideProcessingState en
        // ifc-metrados.service.ts: is_current arranca en false siempre).
        //
        // Si hay OTRA fila vigente para el mismo documento, es la
        // versión "tombstone" saliente: se le borran los datos
        // derivados (mismo mecanismo de abajo) y se le apaga
        // is_current — su fila en ifc_files/files queda intacta como
        // registro histórico (quién subió, cuándo, el .ifc físico sigue
        // descargable), simplemente deja de tener metrado cargado.
        const { rows: selfRows } = await client.query<{ ifc_document_id: string }>(
            `SELECT ifc_document_id FROM ifc_files WHERE ifc_file_id = $1 FOR UPDATE`,
            [ifcFileId]
        );
        const ifcDocumentId = selfRows[0]!.ifc_document_id;

        const { rows: currentRows } = await client.query<{ ifc_file_id: string }>(
            `SELECT ifc_file_id FROM ifc_files WHERE ifc_document_id = $1 AND is_current = true FOR UPDATE`,
            [ifcDocumentId]
        );
        const oldCurrentId = currentRows[0] ? Number(currentRows[0].ifc_file_id) : null;

        if (oldCurrentId !== null && oldCurrentId !== ifcFileId) {
            await client.query(`DELETE FROM ifc_elements WHERE ifc_file_id = $1`, [oldCurrentId]);
            await client.query(`DELETE FROM ifc_properties WHERE ifc_file_id = $1`, [oldCurrentId]);
            await client.query(`DELETE FROM metrado_partidas WHERE ifc_file_id = $1`, [oldCurrentId]);
            await client.query(`UPDATE ifc_files SET is_current = false WHERE ifc_file_id = $1`, [oldCurrentId]);
        }

        // Los ON DELETE CASCADE del schema se llevan puestos
        // ifc_element_property_values/ifc_property_values (vía
        // ifc_elements/ifc_properties) y metrado_elements/
        // metrado_partida_totals (vía metrado_partidas). Para una fila
        // recién creada esto es un no-op — solo importa de verdad en
        // force=true (reproceso en el lugar).
        await client.query(`DELETE FROM ifc_elements WHERE ifc_file_id = $1`, [ifcFileId]);
        await client.query(`DELETE FROM ifc_properties WHERE ifc_file_id = $1`, [ifcFileId]);
        await client.query(`DELETE FROM metrado_partidas WHERE ifc_file_id = $1`, [ifcFileId]);

        const expressIdToElementId = new Map<number, number>();
        for (const batch of chunk(resultado.elements, CHUNK_SIZE)) {
            const { rows } = await client.query<{ express_id: string; element_id: string }>(
                `INSERT INTO ifc_elements (ifc_file_id, express_id, global_id, tag, ifc_type, name, level_name, space_name)
                SELECT $1, u.express_id, u.global_id, u.tag, u.ifc_type, u.name, u.level_name, u.space_name
                FROM UNNEST($2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
                    AS u(express_id, global_id, tag, ifc_type, name, level_name, space_name)
                RETURNING express_id, element_id`,
                [
                    ifcFileId,
                    batch.map((el) => el.express_id),
                    batch.map((el) => el.global_id),
                    batch.map((el) => el.tag),
                    batch.map((el) => el.ifc_type),
                    batch.map((el) => el.name),
                    batch.map((el) => el.level_name),
                    batch.map((el) => el.space_name),
                ]
            );
            for (const row of rows) expressIdToElementId.set(Number(row.express_id), Number(row.element_id));
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

        // Resuelve los 3 ids de una para cada relación ANTES de armar los
        // arrays del batch — mismo criterio "continue si falta algo" que
        // antes, solo que ahora filtra la lista completa primero en vez
        // de decidirlo INSERT por INSERT.
        const relacionesResueltas: { elementId: number; propertyId: number; valueId: number }[] = [];
        for (const rel of resultado.properties.relations) {
            const elementId = expressIdToElementId.get(rel.express_id);
            const propertyId = propKeyToId.get(`${rel.property_set} ${rel.property_name}`);
            if (elementId === undefined || propertyId === undefined) continue;
            const valueId = valueKeyToId.get(`${propertyId} ${rel.value}`);
            if (valueId === undefined) continue;
            relacionesResueltas.push({ elementId, propertyId, valueId });
        }
        for (const batch of chunk(relacionesResueltas, CHUNK_SIZE)) {
            await client.query(
                `INSERT INTO ifc_element_property_values (element_id, property_id, value_id)
                SELECT * FROM UNNEST($1::bigint[], $2::bigint[], $3::bigint[])
                ON CONFLICT DO NOTHING`,
                [
                    batch.map((r) => r.elementId),
                    batch.map((r) => r.propertyId),
                    batch.map((r) => r.valueId),
                ]
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

        const metradoElementsResueltos: { partidaId: number; elementId: number; me: PipelineMetradoElement }[] = [];
        for (const me of resultado.metrado_elements) {
            const partidaId = codeToPartidaId.get(me.partida_code);
            const elementId = expressIdToElementId.get(me.express_id);
            if (partidaId === undefined || elementId === undefined) continue;
            metradoElementsResueltos.push({ partidaId, elementId, me });
        }
        for (const batch of chunk(metradoElementsResueltos, CHUNK_SIZE)) {
            await client.query(
                `INSERT INTO metrado_elements
                    (partida_id, element_id, length, run_length, width, height, diameter, quantity, area, volume, weight)
                SELECT * FROM UNNEST(
                    $1::bigint[], $2::bigint[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[],
                    $7::numeric[], $8::numeric[], $9::numeric[], $10::numeric[], $11::numeric[]
                )`,
                [
                    batch.map((r) => r.partidaId),
                    batch.map((r) => r.elementId),
                    batch.map((r) => r.me.length),
                    batch.map((r) => r.me.run_length),
                    batch.map((r) => r.me.width),
                    batch.map((r) => r.me.height),
                    batch.map((r) => r.me.diameter),
                    batch.map((r) => r.me.quantity),
                    batch.map((r) => r.me.area),
                    batch.map((r) => r.me.volume),
                    batch.map((r) => r.me.weight),
                ]
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
                SET status = 'done', schema_version = $2, processed_at = NOW(), error_message = NULL, is_current = true,
                    classification_config_used = $3
            WHERE ifc_file_id = $1`,
            [ifcFileId, resultado.schema_version, JSON.stringify(classificationSnapshot)]
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
export const runIfcProcessing = async (
    ifcFileId: number, filePath: string, classificationSnapshot: IfcClassificationSnapshot
): Promise<void> => {
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
        // Fase 4 — mode y property_prefix se resuelven siempre (incluso
        // "todo por defecto" es un snapshot válido, ver
        // ifc-classification.service.ts), así que este archivo temporal
        // se escribe siempre — cli.py decide con esos dos campos si hay
        // algo distinto de 'norma'/sin-prefijo que aplicar. Se limpia en
        // el finally de abajo igual que tmpOutPath.
        const tmpConfigPath = path.join(os.tmpdir(), `ifc-classification-${ifcFileId}-${crypto.randomUUID()}.json`);

        try {
            await fs.writeFile(tmpConfigPath, JSON.stringify(classificationSnapshot), "utf-8");

            const args = [
                "-m", "processing.ifc.cli",
                resolvedPath,
                "--norma", NORMA_JSON_PATH,
                "--out", tmpOutPath,
                "--classification-config", tmpConfigPath,
            ];

            await execFileAsync(PYTHON_BIN, args, {
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
        } finally {
            await fs.rm(tmpConfigPath, { force: true });
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
            await insertarResultado(ifcFileId, resultado, classificationSnapshot);
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
