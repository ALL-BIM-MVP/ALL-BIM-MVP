// warehouses ("la casa") — ver docs/roadmap/almacen-bim-base-datos.md
// 1.2. getWarehouseRowOrThrow y ALMACEN_MODULE_CODE se exportan porque
// rack/bin/category/product/location-search (mismo módulo, un nivel
// más abajo en la jerarquía) los reusan — evita repetir la misma
// query/permiso en cada archivo. El nombre de la constante mantiene
// "ALMACEN" (no "WAREHOUSE") a propósito: es el código real del módulo
// en `modules.code` (ver database/system-data.sql), su propio nombre
// de marca en español — mismo criterio que METRADOS_MODULE_CODE en
// ifc-classification.service.ts.
import pool from "../../db/database.js";
import { AppError } from "../../models/errors/app-error.js";
import { WAREHOUSE_ERRORS } from "../../models/errors/almacen/warehouse.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import type { CreateWarehouseBody, UpdateWarehouseBody, WarehouseIdParam } from "../../schemas/almacen/warehouse.schema.js";
import type { WarehouseRow } from "../../models/almacen/warehouse.models.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import { assertStyleExists } from "./warehouse-style.service.js";

export const ALMACEN_MODULE_CODE = "almacen";

const UNIQUE_VIOLATION = "23505";

const computeArea = (corner1_x: number, corner1_z: number, corner2_x: number, corner2_z: number): number =>
    Math.abs(corner2_x - corner1_x) * Math.abs(corner2_z - corner1_z);

const assertValidFootprint = (corner1_x: number, corner1_z: number, corner2_x: number, corner2_z: number): void => {
    if (corner1_x === corner2_x || corner1_z === corner2_z) throw new AppError(WAREHOUSE_ERRORS.INVALID_FOOTPRINT);
};

export const getWarehouseRowOrThrow = async (
    projectId: number, warehouseId: number
): Promise<WarehouseRow> => {
    const { rows } = await pool.query<WarehouseRow>(
        `SELECT * FROM warehouses WHERE warehouse_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
        [warehouseId, projectId]
    );
    const warehouse = rows[0];
    if (!warehouse) throw new AppError(WAREHOUSE_ERRORS.WAREHOUSE_NOT_FOUND);
    return warehouse;
};

export const listWarehousesService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<WarehouseRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const { rows } = await pool.query<WarehouseRow>(
        `SELECT * FROM warehouses WHERE project_id = $1 AND deleted_at IS NULL ORDER BY name`,
        [projectId]
    );
    return rows;
};

export const getWarehouseByIdService = async (
    user: DecodedToken, { projectId, warehouseId }: WarehouseIdParam
): Promise<WarehouseRow> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return getWarehouseRowOrThrow(projectId, warehouseId);
};

export const createWarehouseService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreateWarehouseBody
): Promise<WarehouseRow> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    await assertStyleExists(body.warehouse_style_id);
    assertValidFootprint(body.corner1_x, body.corner1_z, body.corner2_x, body.corner2_z);
    const area_m2 = computeArea(body.corner1_x, body.corner1_z, body.corner2_x, body.corner2_z);

    try {
        const { rows } = await pool.query<WarehouseRow>(
            `INSERT INTO warehouses
                (project_id, warehouse_style_id, name, corner1_x, corner1_z, corner2_x, corner2_z,
                 direction, area_m2, grid_width, grid_depth, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *`,
            [
                projectId, body.warehouse_style_id, body.name,
                body.corner1_x, body.corner1_z, body.corner2_x, body.corner2_z,
                body.direction, area_m2, body.grid_width, body.grid_depth, user.user_id,
            ]
        );
        return rows[0]!;
    } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(WAREHOUSE_ERRORS.DUPLICATE_NAME);
        throw error;
    }
};

// PUT reemplaza todos los campos editables de una — no es un PATCH
// parcial (mismo criterio que IfcClassificationConfigBodySchema).
export const updateWarehouseService = async (
    user: DecodedToken, { projectId, warehouseId }: WarehouseIdParam, body: UpdateWarehouseBody
): Promise<WarehouseRow> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    await getWarehouseRowOrThrow(projectId, warehouseId);
    await assertStyleExists(body.warehouse_style_id);
    assertValidFootprint(body.corner1_x, body.corner1_z, body.corner2_x, body.corner2_z);
    const area_m2 = computeArea(body.corner1_x, body.corner1_z, body.corner2_x, body.corner2_z);

    try {
        const { rows } = await pool.query<WarehouseRow>(
            `UPDATE warehouses SET
                warehouse_style_id = $1, name = $2,
                corner1_x = $3, corner1_z = $4, corner2_x = $5, corner2_z = $6,
                direction = $7, area_m2 = $8, grid_width = $9, grid_depth = $10,
                updated_at = NOW(), updated_by = $11
            WHERE warehouse_id = $12 AND project_id = $13 AND deleted_at IS NULL
            RETURNING *`,
            [
                body.warehouse_style_id, body.name,
                body.corner1_x, body.corner1_z, body.corner2_x, body.corner2_z,
                body.direction, area_m2, body.grid_width, body.grid_depth,
                user.user_id, warehouseId, projectId,
            ]
        );
        const warehouse = rows[0];
        if (!warehouse) throw new AppError(WAREHOUSE_ERRORS.WAREHOUSE_NOT_FOUND);
        return warehouse;
    } catch (error) {
        if (error instanceof AppError) throw error;
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(WAREHOUSE_ERRORS.DUPLICATE_NAME);
        throw error;
    }
};

// Borrado lógico — el RESTRICT real de motor en racks.warehouse_id
// (ver database/schema.sql) es un respaldo para un DELETE de verdad,
// que esta API nunca emite; el bloqueo que de verdad aplica acá es
// este UPDATE guardado con NOT EXISTS, atómico (sin ventana de carrera
// entre "chequear" y "dar de baja" — un rack creado justo en el medio
// también lo bloquea).
export const deleteWarehouseService = async (
    user: DecodedToken, { projectId, warehouseId }: WarehouseIdParam
): Promise<void> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "delete");

    await getWarehouseRowOrThrow(projectId, warehouseId);

    const { rowCount } = await pool.query(
        `UPDATE warehouses SET deleted_at = NOW()
        WHERE warehouse_id = $1 AND project_id = $2 AND deleted_at IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM racks r WHERE r.warehouse_id = warehouses.warehouse_id AND r.deleted_at IS NULL
            )`,
        [warehouseId, projectId]
    );
    if (rowCount === 0) throw new AppError(WAREHOUSE_ERRORS.HAS_RACKS);
};
