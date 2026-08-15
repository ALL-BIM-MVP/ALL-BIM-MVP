import fs from "node:fs";
import type { Pool, PoolClient } from "pg";
import pool from "../db/database.js";
import { AppError } from "../models/errors/app-error.js";
import { PROJECT_ERRORS } from "../models/errors/project.errors.js";
import { PROJECT_IMAGE_ERRORS } from "../models/errors/project-images.errors.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import { buildDefaultCoverImage, toPublicUploadsUrl, type ProjectCoverImage, type ProjectCoverImageInfo } from "../models/project-images.models.js";
import { computeChecksum } from "./files.service.js";

// Solo el dueño del proyecto puede fijar/borrar la portada — mismo
// criterio de acceso que updateProjectService/deleteProjectByIdService
// (no "cualquier miembro", a diferencia de subir/listar archivos
// sueltos). Leer la portada ya no pasa por acá — viaja embebida en
// GET /projects y GET /projects/:id (ver projects.service.ts), servida
// públicamente vía el mount estático de /uploads (ver index.ts).
const assertProjectOwnership = async (
    client : Pool | PoolClient, projectId : number, userId : number
) : Promise<void> => {
    const result = await client.query(
        `SELECT 1 FROM projects WHERE project_id = $1 AND owner_id = $2`,
        [projectId, userId]
    );
    if (result.rowCount === 0) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);
};

// Reemplaza la portada actual (si había) de forma atómica: borra la
// vieja e inserta la nueva dentro de la MISMA transacción — hace falta
// porque solo puede existir UNA fila 'cover' por proyecto (índice único
// parcial en schema.sql), así que insertar la nueva antes de borrar la
// vieja violaría esa unicidad. Los bytes del archivo viejo en disco
// recién se borran DESPUÉS del commit (si el commit fallara, no
// queremos habernos quedado sin el archivo viejo Y sin fila que lo
// referencie).
export const setProjectCoverImageService = async (
    user : DecodedToken, { projectId } : ProjectIdParam, multerFile : Express.Multer.File
) : Promise<ProjectCoverImageInfo> => {

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await assertProjectOwnership(client, projectId, user.user_id);

        const oldResult = await client.query<{ file_id : string; file_path : string }>(
            `SELECT f.file_id, f.file_path
            FROM project_images pi
            INNER JOIN files f ON f.file_id = pi.file_id
            WHERE pi.project_id = $1 AND pi.image_type = 'cover'`,
            [projectId]
        );
        const old = oldResult.rows[0];

        // ON DELETE CASCADE en project_images.file_id se lleva puesta la
        // fila de project_images sola con este DELETE de files.
        if (old) await client.query(`DELETE FROM files WHERE file_id = $1`, [old.file_id]);

        const checksum = await computeChecksum(multerFile.path);

        const insertedFile = await client.query<{ file_id : string }>(
            `INSERT INTO files (project_id, file_type, name, file_path, file_size, checksum, mime_type, uploaded_by)
            VALUES ($1, 'image', $2, $3, $4, $5, $6, $7)
            RETURNING file_id`,
            [projectId, multerFile.originalname, multerFile.path, multerFile.size, checksum, multerFile.mimetype, user.user_id]
        );
        const fileId = insertedFile.rows[0]!.file_id;

        await client.query(
            `INSERT INTO project_images (project_id, file_id, image_type, sort_order)
            VALUES ($1, $2, 'cover', 0)`,
            [projectId, fileId]
        );

        await client.query("COMMIT");

        if (old) await fs.promises.rm(old.file_path, { force: true });

        return {
            file_id: fileId,
            name: multerFile.originalname,
            mime_type: multerFile.mimetype,
            file_size: multerFile.size,
            url: toPublicUploadsUrl(multerFile.path),
        };
    } catch (error) {
        await client.query("ROLLBACK");
        // El archivo recién subido por multer nunca llegó a insertarse
        // (o se revirtió) — no queda ninguna fila que lo referencie, hay
        // que limpiarlo del disco para no dejar basura huérfana.
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

    const result = await pool.query<{ file_path : string }>(
        `DELETE FROM files f
        USING project_images pi
        WHERE f.file_id = pi.file_id AND pi.project_id = $1 AND pi.image_type = 'cover'
        RETURNING f.file_path`,
        [projectId]
    );

    const deleted = result.rows[0];
    if (!deleted) throw new AppError(PROJECT_IMAGE_ERRORS.NO_COVER_IMAGE);

    await fs.promises.rm(deleted.file_path, { force: true });

    return buildDefaultCoverImage();
};
