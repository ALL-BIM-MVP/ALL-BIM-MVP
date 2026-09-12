// estante (+ generación automática de casilla) — ver
// docs/roadmap/almacen-bim-base-datos.md 1.3. Importa de
// casilla.service.ts (generar/listar casillas) pero casilla.service.ts
// NUNCA importa de acá — así se evita el ciclo estante↔casilla (ver
// comentario grande en casilla.service.ts).
import pool from "../../db/database.js";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { ESTANTE_ERRORS } from "../../models/errors/almacen/estante.errors.js";
// Solo la constante de error, no una llamada de servicio a servicio —
// no genera ciclo (ver comentario grande en casilla.service.ts).
import { ALMACEN_ERRORS } from "../../models/errors/almacen/almacen.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE, getAlmacenRowOrThrow } from "./almacen.service.js";
import { insertCasillasParaEstante, listCasillasDeEstante } from "./casilla.service.js";
import type { AlmacenIdParam } from "../../schemas/almacen/almacen.schema.js";
import type { CreateEstanteBody, EstanteIdParam, UpdateEstanteBody } from "../../schemas/almacen/estante.schema.js";
import type { AlmacenRow } from "../../models/almacen/almacen.models.js";
import type { EstanteConCasillas, EstanteFull, EstanteRow } from "../../models/almacen/estante.models.js";

const UNIQUE_VIOLATION = "23505";

// Metros por cubo — MISMO valor que usa el prototipo
// (prueba-BIM/ALMACEN-BIM/index.html y modulo.html, `var CUBE_SIZE`).
// Si el día de mañana el frontend real cambia este número, este
// archivo tiene que cambiar junto (no hay una fuente única compartida
// todavía).
const CUBE_SIZE = 1.3;
const EPS = 1e-6;

const cercaDeEntero = (n: number): boolean => Math.abs(n - Math.round(n)) < EPS;

interface GeometriaEstante {
    cx: number;
    cz: number;
    ancho: number;
    profundidad: number;
}

// Traduce las 2 esquinas reales (metros, locales al almacén) a índices
// de grilla — mismo criterio que `almacen`: sin cx/cz ni ancho/
// profundidad como columnas, se derivan siempre de acá (ver diseño
// 1.3). Tira ESTANTE_ESQUINAS_INVALIDAS si algo no cae justo en la
// grilla de cubos, y ESTANTE_PROFUNDIDAD_INVALIDA si la profundidad
// resultante no es 1 o 2 — nunca deja pasar un estante geométricamente
// imposible.
const resolverGeometriaEstante = (
    esquina1_x: number, esquina1_z: number, esquina2_x: number, esquina2_z: number
): GeometriaEstante => {
    const minX = Math.min(esquina1_x, esquina2_x);
    const maxX = Math.max(esquina1_x, esquina2_x);
    const minZ = Math.min(esquina1_z, esquina2_z);
    const maxZ = Math.max(esquina1_z, esquina2_z);

    if (minX === maxX || minZ === maxZ) throw new AppError(ESTANTE_ERRORS.ESTANTE_ESQUINAS_INVALIDAS);

    const cxRaw = minX / CUBE_SIZE;
    const czRaw = minZ / CUBE_SIZE;
    const anchoRaw = (maxX - minX) / CUBE_SIZE;
    const profundidadRaw = (maxZ - minZ) / CUBE_SIZE;

    if (![cxRaw, czRaw, anchoRaw, profundidadRaw].every(cercaDeEntero)) {
        throw new AppError(ESTANTE_ERRORS.ESTANTE_ESQUINAS_INVALIDAS);
    }

    const profundidad = Math.round(profundidadRaw);
    if (profundidad !== 1 && profundidad !== 2) throw new AppError(ESTANTE_ERRORS.ESTANTE_PROFUNDIDAD_INVALIDA);

    return { cx: Math.round(cxRaw), cz: Math.round(czRaw), ancho: Math.round(anchoRaw), profundidad };
};

export const getEstanteRowOrThrow = async (
    client: Pool | PoolClient, almacenId: number, estanteId: number
): Promise<EstanteRow> => {
    const { rows } = await client.query<EstanteRow>(
        `SELECT * FROM estante WHERE estante_id = $1 AND almacen_id = $2 AND eliminado_en IS NULL`,
        [estanteId, almacenId]
    );
    const estante = rows[0];
    if (!estante) throw new AppError(ESTANTE_ERRORS.ESTANTE_NOT_FOUND);
    return estante;
};

const toEstanteFull = (row: EstanteRow): EstanteFull => {
    const geom = resolverGeometriaEstante(row.esquina1_x, row.esquina1_z, row.esquina2_x, row.esquina2_z);
    return { ...row, ancho: geom.ancho, profundidad: geom.profundidad };
};

// 1 cubo de pasillo obligatorio contra CUALQUIER otro estante activo
// del mismo almacén — mismo algoritmo que ya usa el prototipo
// (prueba-BIM/ALMACEN-BIM/index.html, validarColocacionEstante): se
// expande un solo lado del rectángulo candidato por el buffer, alcanza
// para exigir la distancia mínima en los dos sentidos.
const assertPasilloLibre = async (
    client: PoolClient, almacenId: number, candidato: GeometriaEstante
): Promise<void> => {
    const { rows } = await client.query<Pick<EstanteRow, "esquina1_x" | "esquina1_z" | "esquina2_x" | "esquina2_z">>(
        `SELECT esquina1_x, esquina1_z, esquina2_x, esquina2_z FROM estante
        WHERE almacen_id = $1 AND eliminado_en IS NULL`,
        [almacenId]
    );

    const buffer = 1;
    for (const row of rows) {
        const g = resolverGeometriaEstante(row.esquina1_x, row.esquina1_z, row.esquina2_x, row.esquina2_z);
        const overlapX = candidato.cx < g.cx + g.ancho + buffer && candidato.cx + candidato.ancho + buffer > g.cx;
        const overlapZ = candidato.cz < g.cz + g.profundidad + buffer && candidato.cz + candidato.profundidad + buffer > g.cz;
        if (overlapX && overlapZ) throw new AppError(ESTANTE_ERRORS.ESTANTE_SIN_PASILLO);
    }
};

export const listEstantesService = async (
    user: DecodedToken, { projectId, almacenId }: AlmacenIdParam
): Promise<EstanteFull[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    await getAlmacenRowOrThrow(projectId, almacenId);

    const { rows } = await pool.query<EstanteRow>(
        `SELECT * FROM estante WHERE almacen_id = $1 AND eliminado_en IS NULL ORDER BY nombre`,
        [almacenId]
    );
    return rows.map(toEstanteFull);
};

export const getEstanteByIdService = async (
    user: DecodedToken, { projectId, almacenId, estanteId }: EstanteIdParam
): Promise<EstanteConCasillas> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    await getAlmacenRowOrThrow(projectId, almacenId);
    const estante = await getEstanteRowOrThrow(pool, almacenId, estanteId);

    const casillas = await listCasillasDeEstante(estanteId);
    return { ...toEstanteFull(estante), casillas };
};

export const createEstanteService = async (
    user: DecodedToken, { projectId, almacenId }: AlmacenIdParam, body: CreateEstanteBody
): Promise<EstanteConCasillas> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const almacenResult = await pool.query<AlmacenRow & { nivel_maximo: number }>(
        `SELECT a.*, es.nivel_maximo FROM almacen a
        INNER JOIN almacen_estilo es USING(almacen_estilo_id)
        WHERE a.almacen_id = $1 AND a.project_id = $2 AND a.eliminado_en IS NULL`,
        [almacenId, projectId]
    );
    const almacen = almacenResult.rows[0];
    if (!almacen) throw new AppError(ALMACEN_ERRORS.ALMACEN_NOT_FOUND);

    const geom = resolverGeometriaEstante(body.esquina1_x, body.esquina1_z, body.esquina2_x, body.esquina2_z);

    if (geom.cx < 0 || geom.cz < 0 || geom.cx + geom.ancho > almacen.grid_ancho || geom.cz + geom.profundidad > almacen.grid_profundo) {
        throw new AppError(ESTANTE_ERRORS.ESTANTE_FUERA_DE_GRILLA);
    }
    // Techo del almacén (estilo) — mismo chequeo que ya hacía el
    // prototipo (validarColocacionEstante: cand.h > t.maxNivel), NO es
    // la coherencia footprint/grid que el sistema decidió NO forzar
    // (ver nota en database/schema.sql, almacen.grid_ancho) — esta es
    // una restricción física real y distinta: la altura del estante
    // contra el techo real del almacén.
    if (body.niveles > almacen.nivel_maximo) {
        throw new AppError(ESTANTE_ERRORS.ESTANTE_SUPERA_NIVEL_MAXIMO);
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await assertPasilloLibre(client, almacenId, geom);

        const inserted = await client.query<{ estante_id: number }>(
            `INSERT INTO estante
                (almacen_id, nombre, esquina1_x, esquina1_z, esquina2_x, esquina2_z, niveles, direccion, creado_por)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING estante_id`,
            [
                almacenId, body.nombre, body.esquina1_x, body.esquina1_z, body.esquina2_x, body.esquina2_z,
                body.niveles, body.direccion, user.user_id,
            ]
        );
        const estanteId = inserted.rows[0]!.estante_id;

        await insertCasillasParaEstante(client, estanteId, body.nombre, geom.ancho, body.niveles, geom.profundidad);

        await client.query("COMMIT");
        return await getEstanteByIdService(user, { projectId, almacenId, estanteId });
    } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof AppError) throw error;
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(ESTANTE_ERRORS.NOMBRE_ESTANTE_DUPLICADO);
        throw error;
    } finally {
        client.release();
    }
};

// Único campo editable de un estante ya existente — reubicarlo
// (esquinas/niveles/dirección) implicaría regenerar sus casillas desde
// cero, con riesgo real de perder contenido/nombres ya editados: fuera
// de alcance de esta fase (ver schemas/almacen/estante.schema.ts).
export const updateEstanteService = async (
    user: DecodedToken, { projectId, almacenId, estanteId }: EstanteIdParam, body: UpdateEstanteBody
): Promise<EstanteFull> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");
    await getAlmacenRowOrThrow(projectId, almacenId);

    try {
        const { rows } = await pool.query<EstanteRow>(
            `UPDATE estante SET nombre = $1, actualizado_en = NOW(), actualizado_por = $2
            WHERE estante_id = $3 AND almacen_id = $4 AND eliminado_en IS NULL
            RETURNING *`,
            [body.nombre, user.user_id, estanteId, almacenId]
        );
        const estante = rows[0];
        if (!estante) throw new AppError(ESTANTE_ERRORS.ESTANTE_NOT_FOUND);
        return toEstanteFull(estante);
    } catch (error) {
        if (error instanceof AppError) throw error;
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(ESTANTE_ERRORS.NOMBRE_ESTANTE_DUPLICADO);
        throw error;
    }
};

// Mismo criterio que deleteAlmacenService: el bloqueo real es este
// UPDATE guardado (atómico), el RESTRICT de motor en
// casilla.estante_id es el respaldo para un DELETE de verdad. Cubre
// las 2 causas de bloqueo de una casilla (contenido con cantidad > 0, o
// participa de un merge) sin distinguir cuál fue — mensaje genérico
// "vaciar antes" alcanza para las dos.
export const deleteEstanteService = async (
    user: DecodedToken, { projectId, almacenId, estanteId }: EstanteIdParam
): Promise<void> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "delete");
    await getAlmacenRowOrThrow(projectId, almacenId);
    await getEstanteRowOrThrow(pool, almacenId, estanteId);

    const { rowCount } = await pool.query(
        `UPDATE estante SET eliminado_en = NOW()
        WHERE estante_id = $1 AND almacen_id = $2 AND eliminado_en IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM casilla c
                WHERE c.estante_id = estante.estante_id AND c.eliminado_en IS NULL
                    AND (
                        EXISTS (SELECT 1 FROM casilla_contenido cc WHERE cc.casilla_id = c.casilla_id AND cc.cantidad > 0)
                        OR EXISTS (SELECT 1 FROM casilla_merge_miembro cm WHERE cm.casilla_id = c.casilla_id)
                    )
            )`,
        [estanteId, almacenId]
    );
    if (rowCount === 0) throw new AppError(ESTANTE_ERRORS.TIENE_CASILLAS);
};
