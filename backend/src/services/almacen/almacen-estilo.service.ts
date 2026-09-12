// almacen_estilo — catálogo GLOBAL (no por proyecto, mismo criterio
// que ifc_specialties/modules), solo lectura en esta fase: crear
// estilos nuevos queda a futuro, hoy alcanza con los sembrados en
// database/system-data.sql.
import pool from "../../db/database.js";
import { AppError } from "../../models/errors/app-error.js";
import { ALMACEN_ERRORS } from "../../models/errors/almacen/almacen.errors.js";
import type { AlmacenEstiloRow } from "../../models/almacen/almacen-estilo.models.js";

export const listAlmacenEstilosService = async (): Promise<AlmacenEstiloRow[]> => {
    const { rows } = await pool.query<AlmacenEstiloRow>(
        `SELECT almacen_estilo_id, nombre, color_techo, color_pared, color_pared_marco, nivel_maximo
        FROM almacen_estilo WHERE eliminado_en IS NULL ORDER BY nombre`
    );
    return rows;
};

// Usado por almacen.service.ts al crear/editar un almacén — valida la
// FK antes del INSERT/UPDATE para devolver un error legible en vez de
// depender del 23503 crudo de Postgres.
export const assertEstiloExiste = async (almacenEstiloId: number): Promise<void> => {
    const { rowCount } = await pool.query(
        `SELECT 1 FROM almacen_estilo WHERE almacen_estilo_id = $1 AND eliminado_en IS NULL`,
        [almacenEstiloId]
    );
    if (rowCount === 0) throw new AppError(ALMACEN_ERRORS.ESTILO_NOT_FOUND);
};
