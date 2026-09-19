import fs from "node:fs";
import type { Pool, PoolClient } from "pg";
import pool from "../db/database.js";
import { AppError } from "../models/errors/app-error.js";
import { PROJECT_ERRORS } from "../models/errors/project.errors.js";
import { PROJECT_IMAGE_ERRORS } from "../models/errors/project-images.errors.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import { buildDefaultCoverImage, toPublicUploadsUrl, type ProjectCoverImage, type ProjectCoverImageInfo } from "../models/project-images.models.js";

// Solo el dueño del proyecto puede fijar/borrar la portada — mismo
// criterio de acceso que updateProjectService/deleteProjectByIdService
// (no "cualquier miembro"). Leer la portada no pasa por acá — viaja
// embebida en GET /projects y GET /projects/:id (ver projects.service.ts),
// servida públicamente vía el mount estático de /uploads (ver index.ts).
const assertProjectOwnership = async (
    client : Pool | PoolClient, projectId : number, userId : number
) : Promise<void> => {
    const result = await client.query(
        `SELECT 1 FROM projects WHERE project_id = $1 AND owner_id = $2`,
        [projectId, userId]
    );
    if (result.rowCount === 0) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);
};

// La portada vive en columnas de `projects` (cover_image_*, ver
// database/schema.sql), NO como un archivo de `files`: no es un
// documento de ningún módulo. Reemplaza la actual (si había) de forma
// atómica — las columnas se pisan en un solo UPDATE — y los bytes del
// archivo viejo recién se borran DESPUÉS del commit (si el commit
// fallara, no queremos habernos quedado sin el archivo viejo Y sin
// columnas que lo referencien).
export const setProjectCoverImageService = async (
    user : DecodedToken, { projectId } : ProjectIdParam, multerFile : Express.Multer.File
) : Promise<ProjectCoverImageInfo> => {

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await assertProjectOwnership(client, projectId, user.user_id);

        const oldResult = await client.query<{ cover_image_path : string | null }>(
            `SELECT cover_image_path FROM projects WHERE project_id = $1 FOR UPDATE`,
            [projectId]
        );
        const oldPath = oldResult.rows[0]?.cover_image_path ?? null;

        await client.query(
            `UPDATE projects
            SET cover_image_path = $2, cover_image_name = $3, cover_image_mime_type = $4
            WHERE project_id = $1`,
            [projectId, multerFile.path, multerFile.originalname, multerFile.mimetype]
        );

        await client.query("COMMIT");

        if (oldPath && oldPath !== multerFile.path) await fs.promises.rm(oldPath, { force: true });

        return {
            name: multerFile.originalname,
            mime_type: multerFile.mimetype,
            file_size: multerFile.size,
            url: toPublicUploadsUrl(multerFile.path),
        };
    } catch (error) {
        await client.query("ROLLBACK");
        // El archivo recién subido por multer nunca llegó a referenciarse
        // (o se revirtió) — hay que limpiarlo del disco para no dejar
        // basura huérfana.
        await fs.promises.rm(multerFile.path, { force: true });
        throw error;
    } finally {
        client.release();
    }
};

// Devuelve la imagen por defecto (no void) — así el frontend puede
// pisar directo su cover_image en memoria con la respuesta de este
// mismo DELETE, sin tener que volver a pedir el proyecto para saber
// qué mostrar ahora que ya no hay portada propia.
export const deleteProjectCoverImageService = async (
    user : DecodedToken, { projectId } : ProjectIdParam
) : Promise<ProjectCoverImage> => {

    await assertProjectOwnership(pool, projectId, user.user_id);

    // Un solo statement: el CTE lee la ruta VIEJA (snapshot previo al
    // UPDATE) y el UPDATE deja las 3 columnas en NULL.
    const result = await pool.query<{ old_path : string }>(
        `WITH old AS (
            SELECT cover_image_path FROM projects WHERE project_id = $1 AND cover_image_path IS NOT NULL
        )
        UPDATE projects
        SET cover_image_path = NULL, cover_image_name = NULL, cover_image_mime_type = NULL
        WHERE project_id = $1 AND cover_image_path IS NOT NULL
        RETURNING (SELECT cover_image_path FROM old) AS old_path`,
        [projectId]
    );

    const deleted = result.rows[0];
    if (!deleted) throw new AppError(PROJECT_IMAGE_ERRORS.NO_COVER_IMAGE);

    await fs.promises.rm(deleted.old_path, { force: true });

    return buildDefaultCoverImage();
};
