// warehouse_styles — catálogo GLOBAL (no por proyecto, mismo criterio
// que ifc_specialties/modules), solo lectura en esta fase: crear
// estilos nuevos queda a futuro, hoy alcanza con los sembrados en
// database/system-data.sql.
import pool from "../../db/database.js";
import { AppError } from "../../models/errors/app-error.js";
import { WAREHOUSE_ERRORS } from "../../models/errors/almacen/warehouse.errors.js";
import type { WarehouseStyleRow } from "../../models/almacen/warehouse-style.models.js";

export const listWarehouseStylesService = async (): Promise<WarehouseStyleRow[]> => {
    const { rows } = await pool.query<WarehouseStyleRow>(
        `SELECT warehouse_style_id, name, roof_color, wall_color, wall_frame_color, max_level
        FROM warehouse_styles WHERE deleted_at IS NULL ORDER BY name`
    );
    return rows;
};

// Usado por warehouse.service.ts al crear/editar un warehouse — valida
// la FK antes del INSERT/UPDATE para devolver un error legible en vez
// de depender del 23503 crudo de Postgres.
export const assertStyleExists = async (warehouseStyleId: number): Promise<void> => {
    const { rowCount } = await pool.query(
        `SELECT 1 FROM warehouse_styles WHERE warehouse_style_id = $1 AND deleted_at IS NULL`,
        [warehouseStyleId]
    );
    if (rowCount === 0) throw new AppError(WAREHOUSE_ERRORS.STYLE_NOT_FOUND);
};
