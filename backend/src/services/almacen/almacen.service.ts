// almacen ("la casa") — ver docs/roadmap/almacen-bim-base-datos.md 1.2.
// getAlmacenRowOrThrow y ALMACEN_MODULE_CODE se exportan porque
// estante/casilla/ubicacion-busqueda (mismo módulo, un nivel más abajo
// en la jerarquía) los reusan — evita repetir la misma query/permiso
// en cada archivo.
import pool from "../../db/database.js";
import { AppError } from "../../models/errors/app-error.js";
import { ALMACEN_ERRORS } from "../../models/errors/almacen/almacen.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import type { AlmacenIdParam, CreateAlmacenBody, UpdateAlmacenBody } from "../../schemas/almacen/almacen.schema.js";
import type { AlmacenRow } from "../../models/almacen/almacen.models.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import { assertEstiloExiste } from "./almacen-estilo.service.js";

export const ALMACEN_MODULE_CODE = "almacen";

const UNIQUE_VIOLATION = "23505";

const areaDe = (esquina1_x: number, esquina1_z: number, esquina2_x: number, esquina2_z: number): number =>
    Math.abs(esquina2_x - esquina1_x) * Math.abs(esquina2_z - esquina1_z);

const assertFootprintValido = (esquina1_x: number, esquina1_z: number, esquina2_x: number, esquina2_z: number): void => {
    if (esquina1_x === esquina2_x || esquina1_z === esquina2_z) throw new AppError(ALMACEN_ERRORS.FOOTPRINT_INVALIDO);
};

export const getAlmacenRowOrThrow = async (
    projectId: number, almacenId: number
): Promise<AlmacenRow> => {
    const { rows } = await pool.query<AlmacenRow>(
        `SELECT * FROM almacen WHERE almacen_id = $1 AND project_id = $2 AND eliminado_en IS NULL`,
        [almacenId, projectId]
    );
    const almacen = rows[0];
    if (!almacen) throw new AppError(ALMACEN_ERRORS.ALMACEN_NOT_FOUND);
    return almacen;
};

export const listAlmacenesService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<AlmacenRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const { rows } = await pool.query<AlmacenRow>(
        `SELECT * FROM almacen WHERE project_id = $1 AND eliminado_en IS NULL ORDER BY nombre`,
        [projectId]
    );
    return rows;
};

export const getAlmacenByIdService = async (
    user: DecodedToken, { projectId, almacenId }: AlmacenIdParam
): Promise<AlmacenRow> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return getAlmacenRowOrThrow(projectId, almacenId);
};

export const createAlmacenService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreateAlmacenBody
): Promise<AlmacenRow> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    await assertEstiloExiste(body.almacen_estilo_id);
    assertFootprintValido(body.esquina1_x, body.esquina1_z, body.esquina2_x, body.esquina2_z);
    const area_m2 = areaDe(body.esquina1_x, body.esquina1_z, body.esquina2_x, body.esquina2_z);

    try {
        const { rows } = await pool.query<AlmacenRow>(
            `INSERT INTO almacen
                (project_id, almacen_estilo_id, nombre, esquina1_x, esquina1_z, esquina2_x, esquina2_z,
                 direccion, area_m2, grid_ancho, grid_profundo, creado_por)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
            RETURNING *`,
            [
                projectId, body.almacen_estilo_id, body.nombre,
                body.esquina1_x, body.esquina1_z, body.esquina2_x, body.esquina2_z,
                body.direccion, area_m2, body.grid_ancho, body.grid_profundo, user.user_id,
            ]
        );
        return rows[0]!;
    } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(ALMACEN_ERRORS.NOMBRE_DUPLICADO);
        throw error;
    }
};

// PUT reemplaza todos los campos editables de una — no es un PATCH
// parcial (mismo criterio que IfcClassificationConfigBodySchema).
export const updateAlmacenService = async (
    user: DecodedToken, { projectId, almacenId }: AlmacenIdParam, body: UpdateAlmacenBody
): Promise<AlmacenRow> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    await getAlmacenRowOrThrow(projectId, almacenId);
    await assertEstiloExiste(body.almacen_estilo_id);
    assertFootprintValido(body.esquina1_x, body.esquina1_z, body.esquina2_x, body.esquina2_z);
    const area_m2 = areaDe(body.esquina1_x, body.esquina1_z, body.esquina2_x, body.esquina2_z);

    try {
        const { rows } = await pool.query<AlmacenRow>(
            `UPDATE almacen SET
                almacen_estilo_id = $1, nombre = $2,
                esquina1_x = $3, esquina1_z = $4, esquina2_x = $5, esquina2_z = $6,
                direccion = $7, area_m2 = $8, grid_ancho = $9, grid_profundo = $10,
                actualizado_en = NOW(), actualizado_por = $11
            WHERE almacen_id = $12 AND project_id = $13 AND eliminado_en IS NULL
            RETURNING *`,
            [
                body.almacen_estilo_id, body.nombre,
                body.esquina1_x, body.esquina1_z, body.esquina2_x, body.esquina2_z,
                body.direccion, area_m2, body.grid_ancho, body.grid_profundo,
                user.user_id, almacenId, projectId,
            ]
        );
        const almacen = rows[0];
        if (!almacen) throw new AppError(ALMACEN_ERRORS.ALMACEN_NOT_FOUND);
        return almacen;
    } catch (error) {
        if (error instanceof AppError) throw error;
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(ALMACEN_ERRORS.NOMBRE_DUPLICADO);
        throw error;
    }
};

// Borrado lógico — el RESTRICT real de motor en estante.almacen_id (ver
// database/schema.sql) es un respaldo para un DELETE de verdad, que
// esta API nunca emite; el bloqueo que de verdad aplica acá es este
// UPDATE guardado con NOT EXISTS, atómico (sin ventana de carrera entre
// "chequear" y "dar de baja" — un estante creado justo en el medio
// también lo bloquea).
export const deleteAlmacenService = async (
    user: DecodedToken, { projectId, almacenId }: AlmacenIdParam
): Promise<void> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "delete");

    await getAlmacenRowOrThrow(projectId, almacenId);

    const { rowCount } = await pool.query(
        `UPDATE almacen SET eliminado_en = NOW()
        WHERE almacen_id = $1 AND project_id = $2 AND eliminado_en IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM estante e WHERE e.almacen_id = almacen.almacen_id AND e.eliminado_en IS NULL
            )`,
        [almacenId, projectId]
    );
    if (rowCount === 0) throw new AppError(ALMACEN_ERRORS.TIENE_ESTANTES);
};
