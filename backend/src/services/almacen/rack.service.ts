// racks (+ generación automática de bin) — ver
// docs/roadmap/almacen-bim-base-datos.md 1.3. Importa de bin.service.ts
// (generar/listar bins) pero bin.service.ts NUNCA importa de acá — así
// se evita el ciclo rack↔bin (ver comentario grande en bin.service.ts).
import pool from "../../db/database.js";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { RACK_ERRORS } from "../../models/errors/almacen/rack.errors.js";
// Solo la constante de error, no una llamada de servicio a servicio —
// no genera ciclo (ver comentario grande en bin.service.ts).
import { WAREHOUSE_ERRORS } from "../../models/errors/almacen/warehouse.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE, getWarehouseRowOrThrow } from "./warehouse.service.js";
import { insertBinsForRack, listBinsForRack } from "./bin.service.js";
import type { WarehouseIdParam } from "../../schemas/almacen/warehouse.schema.js";
import type { CreateRackBody, RackIdParam, UpdateRackBody } from "../../schemas/almacen/rack.schema.js";
import type { WarehouseRow } from "../../models/almacen/warehouse.models.js";
import type { RackFull, RackRow, RackWithBins } from "../../models/almacen/rack.models.js";

const UNIQUE_VIOLATION = "23505";

// Metros por cubo — MISMO valor que usa el prototipo
// (prueba-BIM/ALMACEN-BIM/index.html y modulo.html, `var CUBE_SIZE`).
// Si el día de mañana el frontend real cambia este número, este
// archivo tiene que cambiar junto (no hay una fuente única compartida
// todavía).
const CUBE_SIZE = 1.3;
const EPS = 1e-6;

const isCloseToInteger = (n: number): boolean => Math.abs(n - Math.round(n)) < EPS;

interface RackGeometry {
    bx: number;
    bz: number;
    width: number;
    depth: number;
}

// Traduce las 2 esquinas reales (metros, locales al warehouse) a
// índices de grilla — mismo criterio que `warehouses`: sin bx/bz ni
// width/depth como columnas, se derivan siempre de acá (ver diseño
// 1.3). Tira INVALID_CORNERS si algo no cae justo en la grilla de
// cubos, y INVALID_DEPTH si la profundidad resultante no es 1 o 2 —
// nunca deja pasar un rack geométricamente imposible.
const resolveRackGeometry = (
    corner1_x: number, corner1_z: number, corner2_x: number, corner2_z: number
): RackGeometry => {
    const minX = Math.min(corner1_x, corner2_x);
    const maxX = Math.max(corner1_x, corner2_x);
    const minZ = Math.min(corner1_z, corner2_z);
    const maxZ = Math.max(corner1_z, corner2_z);

    if (minX === maxX || minZ === maxZ) throw new AppError(RACK_ERRORS.INVALID_CORNERS);

    const bxRaw = minX / CUBE_SIZE;
    const bzRaw = minZ / CUBE_SIZE;
    const widthRaw = (maxX - minX) / CUBE_SIZE;
    const depthRaw = (maxZ - minZ) / CUBE_SIZE;

    if (![bxRaw, bzRaw, widthRaw, depthRaw].every(isCloseToInteger)) {
        throw new AppError(RACK_ERRORS.INVALID_CORNERS);
    }

    const depth = Math.round(depthRaw);
    if (depth !== 1 && depth !== 2) throw new AppError(RACK_ERRORS.INVALID_DEPTH);

    return { bx: Math.round(bxRaw), bz: Math.round(bzRaw), width: Math.round(widthRaw), depth };
};

export const getRackRowOrThrow = async (
    client: Pool | PoolClient, warehouseId: number, rackId: number
): Promise<RackRow> => {
    const { rows } = await client.query<RackRow>(
        `SELECT * FROM racks WHERE rack_id = $1 AND warehouse_id = $2 AND deleted_at IS NULL`,
        [rackId, warehouseId]
    );
    const rack = rows[0];
    if (!rack) throw new AppError(RACK_ERRORS.RACK_NOT_FOUND);
    return rack;
};

const toRackFull = (row: RackRow): RackFull => {
    const geom = resolveRackGeometry(row.corner1_x, row.corner1_z, row.corner2_x, row.corner2_z);
    return { ...row, width: geom.width, depth: geom.depth };
};

// 1 cubo de pasillo obligatorio contra CUALQUIER otro rack activo del
// mismo warehouse — mismo algoritmo que ya usa el prototipo
// (prueba-BIM/ALMACEN-BIM/index.html, validarColocacionEstante): se
// expande un solo lado del rectángulo candidato por el buffer, alcanza
// para exigir la distancia mínima en los dos sentidos.
const assertClearance = async (
    client: PoolClient, warehouseId: number, candidate: RackGeometry
): Promise<void> => {
    const { rows } = await client.query<Pick<RackRow, "corner1_x" | "corner1_z" | "corner2_x" | "corner2_z">>(
        `SELECT corner1_x, corner1_z, corner2_x, corner2_z FROM racks
        WHERE warehouse_id = $1 AND deleted_at IS NULL`,
        [warehouseId]
    );

    const buffer = 1;
    for (const row of rows) {
        const g = resolveRackGeometry(row.corner1_x, row.corner1_z, row.corner2_x, row.corner2_z);
        const overlapX = candidate.bx < g.bx + g.width + buffer && candidate.bx + candidate.width + buffer > g.bx;
        const overlapZ = candidate.bz < g.bz + g.depth + buffer && candidate.bz + candidate.depth + buffer > g.bz;
        if (overlapX && overlapZ) throw new AppError(RACK_ERRORS.NO_CLEARANCE);
    }
};

export const listRacksService = async (
    user: DecodedToken, { projectId, warehouseId }: WarehouseIdParam
): Promise<RackFull[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    await getWarehouseRowOrThrow(projectId, warehouseId);

    const { rows } = await pool.query<RackRow>(
        `SELECT * FROM racks WHERE warehouse_id = $1 AND deleted_at IS NULL ORDER BY name`,
        [warehouseId]
    );
    return rows.map(toRackFull);
};

export const getRackByIdService = async (
    user: DecodedToken, { projectId, warehouseId, rackId }: RackIdParam
): Promise<RackWithBins> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    await getWarehouseRowOrThrow(projectId, warehouseId);
    const rack = await getRackRowOrThrow(pool, warehouseId, rackId);

    const bins = await listBinsForRack(rackId);
    return { ...toRackFull(rack), bins };
};

export const createRackService = async (
    user: DecodedToken, { projectId, warehouseId }: WarehouseIdParam, body: CreateRackBody
): Promise<RackWithBins> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const warehouseResult = await pool.query<WarehouseRow & { max_level: number }>(
        `SELECT w.*, ws.max_level FROM warehouses w
        INNER JOIN warehouse_styles ws USING(warehouse_style_id)
        WHERE w.warehouse_id = $1 AND w.project_id = $2 AND w.deleted_at IS NULL`,
        [warehouseId, projectId]
    );
    const warehouse = warehouseResult.rows[0];
    if (!warehouse) throw new AppError(WAREHOUSE_ERRORS.WAREHOUSE_NOT_FOUND);

    const geom = resolveRackGeometry(body.corner1_x, body.corner1_z, body.corner2_x, body.corner2_z);

    if (geom.bx < 0 || geom.bz < 0 || geom.bx + geom.width > warehouse.grid_width || geom.bz + geom.depth > warehouse.grid_depth) {
        throw new AppError(RACK_ERRORS.OUT_OF_GRID);
    }
    // Techo del warehouse (estilo) — mismo chequeo que ya hacía el
    // prototipo (validarColocacionEstante: cand.h > t.maxNivel), NO es
    // la coherencia footprint/grid que el sistema decidió NO forzar
    // (ver nota en database/schema.sql, warehouses.grid_width) — esta
    // es una restricción física real y distinta: la altura del rack
    // contra el techo real del warehouse.
    if (body.levels > warehouse.max_level) {
        throw new AppError(RACK_ERRORS.EXCEEDS_MAX_LEVEL);
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await assertClearance(client, warehouseId, geom);

        const inserted = await client.query<{ rack_id: number }>(
            `INSERT INTO racks
                (warehouse_id, name, corner1_x, corner1_z, corner2_x, corner2_z, levels, direction, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING rack_id`,
            [
                warehouseId, body.name, body.corner1_x, body.corner1_z, body.corner2_x, body.corner2_z,
                body.levels, body.direction, user.user_id,
            ]
        );
        const rackId = inserted.rows[0]!.rack_id;

        await insertBinsForRack(client, rackId, body.name, geom.width, body.levels, geom.depth);

        await client.query("COMMIT");
        return await getRackByIdService(user, { projectId, warehouseId, rackId });
    } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof AppError) throw error;
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(RACK_ERRORS.DUPLICATE_NAME);
        throw error;
    } finally {
        client.release();
    }
};

// Único campo editable de un rack ya existente — reubicarlo
// (esquinas/niveles/dirección) implicaría regenerar sus bins desde
// cero, con riesgo real de perder contenido/nombres ya editados: fuera
// de alcance de esta fase (ver schemas/almacen/rack.schema.ts).
export const updateRackService = async (
    user: DecodedToken, { projectId, warehouseId, rackId }: RackIdParam, body: UpdateRackBody
): Promise<RackFull> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");
    await getWarehouseRowOrThrow(projectId, warehouseId);

    try {
        const { rows } = await pool.query<RackRow>(
            `UPDATE racks SET name = $1, updated_at = NOW(), updated_by = $2
            WHERE rack_id = $3 AND warehouse_id = $4 AND deleted_at IS NULL
            RETURNING *`,
            [body.name, user.user_id, rackId, warehouseId]
        );
        const rack = rows[0];
        if (!rack) throw new AppError(RACK_ERRORS.RACK_NOT_FOUND);
        return toRackFull(rack);
    } catch (error) {
        if (error instanceof AppError) throw error;
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(RACK_ERRORS.DUPLICATE_NAME);
        throw error;
    }
};

// Mismo criterio que deleteWarehouseService: el bloqueo real es este
// UPDATE guardado (atómico), el RESTRICT de motor en bins.rack_id es
// el respaldo para un DELETE de verdad. Cubre las 2 causas de bloqueo
// de un bin (contenido con quantity > 0, o participa de un merge) sin
// distinguir cuál fue — mensaje genérico "vaciar antes" alcanza para
// las dos.
export const deleteRackService = async (
    user: DecodedToken, { projectId, warehouseId, rackId }: RackIdParam
): Promise<void> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "delete");
    await getWarehouseRowOrThrow(projectId, warehouseId);
    await getRackRowOrThrow(pool, warehouseId, rackId);

    const { rowCount } = await pool.query(
        `UPDATE racks SET deleted_at = NOW()
        WHERE rack_id = $1 AND warehouse_id = $2 AND deleted_at IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM bins b
                WHERE b.rack_id = racks.rack_id AND b.deleted_at IS NULL
                    AND (
                        EXISTS (SELECT 1 FROM bin_contents bc WHERE bc.bin_id = b.bin_id AND bc.quantity > 0)
                        OR EXISTS (SELECT 1 FROM bin_merge_members bm WHERE bm.bin_id = b.bin_id)
                    )
            )`,
        [rackId, warehouseId]
    );
    if (rowCount === 0) throw new AppError(RACK_ERRORS.HAS_BINS);
};
