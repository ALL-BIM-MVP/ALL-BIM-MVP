import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import type { FileIdParam, FileType, GetProjectFilesQuery, ProjectFileIdParam } from "../schemas/file.schema.js";
import {
    transformFileToFull, type FileDownload, type FileFull, type FileRow, type FileThumbnailDownload
} from "../models/files.models.js";
import { AppError } from "../models/errors/app-error.js";
import { PROJECT_ERRORS } from "../models/errors/project.errors.js";
import { FILE_ERRORS } from "../models/errors/files.errors.js";
import { generateThumbnail } from "../utils/thumbnail.js";

const EXTENSION_TO_TYPE: Record<string, FileType> = {
    ".ifc": "ifc",
    ".xlsx": "excel",
    ".xls": "excel",
    ".pdf": "pdf",
    ".txt": "txt",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
};

const inferFileType = (filename : string) : FileType => {
    const extension = path.extname(filename).toLowerCase();
    return EXTENSION_TO_TYPE[extension] ?? "other";
};

// Exportado: project-images.service.ts lo reusa tal cual para la
// portada de un proyecto (mismo mecanismo de guardado que un archivo
// cualquiera, solo cambia dónde queda referenciado después).
export const computeChecksum = (filePath : string) : Promise<string> => {
    // Streaming (no carga el archivo entero en memoria) — importante porque
    // un IFC de un edificio grande puede pesar cientos de MB.
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs.createReadStream(filePath);
        stream.on("data", (chunk : Buffer) => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", reject);
    });
};

// Dueño del proyecto o miembro — mismo criterio para subir, listar y
// descargar archivos, factorizado para no repetir la query. Exportada
// porque ifc-metrados.service.ts la reusa tal cual.
export const assertProjectAccess = async (projectId : number, userId : number) : Promise<void> => {
    const result = await pool.query(
        `SELECT 1 FROM projects p
            WHERE p.project_id = $1 AND (
                p.owner_id = $2
                OR EXISTS (
                    SELECT 1 FROM project_members pm
                    WHERE pm.project_id = p.project_id AND pm.user_id = $2
                )
            )`,
        [projectId, userId]
    );

    if (result.rowCount === 0) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);
};

export const saveFileService = async (
    { user_id : uploadedBy } : DecodedToken, { projectId } : ProjectIdParam,
    fileTypeOverride : FileType | undefined, multerFile : Express.Multer.File
) : Promise<FileFull> => {

    const fileType = fileTypeOverride ?? inferFileType(multerFile.originalname);

    try {
        await assertProjectAccess(projectId, uploadedBy);
    } catch (error) {
        await fs.promises.rm(multerFile.path, { force: true });
        throw error;
    }

    try {
        const checksum = await computeChecksum(multerFile.path);

        // Solo para imágenes, y nunca fatal: si sharp no puede generarla
        // (archivo corrupto, formato no soportado) la subida sigue igual,
        // simplemente queda thumbnail_path=NULL (has_thumbnail=false).
        const thumbnailPath = fileType === "image" ? await generateThumbnail(multerFile.path) : null;

        const result = await pool.query<FileRow>(
            `INSERT INTO
                files(project_id, file_type, name, file_path, file_size, checksum, mime_type, uploaded_by, thumbnail_path)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING
                file_id, project_id, file_type, name, file_size, checksum, mime_type, uploaded_at, thumbnail_path,
                NULL AS ifc_status, NULL AS ifc_error_message,
                uploaded_by AS user_id,
                (SELECT name FROM users WHERE user_id = uploaded_by) AS user_name,
                (SELECT email FROM users WHERE user_id = uploaded_by) AS user_email`,
            [projectId, fileType, multerFile.originalname, multerFile.path, multerFile.size, checksum, multerFile.mimetype, uploadedBy, thumbnailPath]
        );

        const file = result.rows[0];

        if (!file) throw new AppError(FILE_ERRORS.FILE_UPLOAD_FAILED);

        return transformFileToFull(file);
    } catch (error) {
        await fs.promises.rm(multerFile.path, { force: true });
        throw error;
    }
};

export const getProjectFilesService = async (
    { user_id : userId } : DecodedToken, { projectId } : ProjectIdParam,
    { file_type : fileType, processed } : GetProjectFilesQuery
) : Promise<FileFull[]> => {

    await assertProjectAccess(projectId, userId);

    const result = await pool.query<FileRow>(
        `SELECT
            f.file_id, f.project_id, f.file_type, f.name, f.file_size, f.checksum, f.mime_type, f.uploaded_at,
            f.thumbnail_path,
            i.status AS ifc_status, i.error_message AS ifc_error_message,
            u.user_id, u.name AS user_name, u.email AS user_email
        FROM files f
        LEFT JOIN ifc_files i ON i.ifc_file_id = f.file_id
        INNER JOIN users u ON u.user_id = f.uploaded_by
        WHERE f.project_id = $1
            AND ($2::VARCHAR IS NULL OR f.file_type = $2)
            AND (
                $3::BOOLEAN IS NULL                                             -- no se pidió filtro de procesado
                OR ($3 = true  AND i.status = 'done')
                OR ($3 = false AND f.file_type = 'ifc'                          -- processed=false siempre implica ifc
                    AND (i.ifc_file_id IS NULL OR i.status = 'error'))
            )
            AND NOT EXISTS (                                                   -- la portada (y cualquier futura
                SELECT 1 FROM project_images pi WHERE pi.file_id = f.file_id    -- imagen de galería) no es un
            )                                                                   -- "archivo del proyecto", es un rol
        ORDER BY f.uploaded_at DESC`,
        [projectId, fileType ?? null, processed ?? null]
    );

    return result.rows.map((f) => transformFileToFull(f));
};

// requestingUser=null significa "ya autorizado por un ?token= firmado"
// (ver middlewares/file-access.middleware.ts) — la firma demostró
// autorización en el momento en que se generó (al armar la lista, con
// assertProjectAccess ya corrido ahí), así que acá NO se vuelve a
// golpear la BD para chequear membresía/dueño. Con un DecodedToken sí
// se corre igual que siempre (consumo por Authorization: Bearer).
export const getFileForDownloadService = async (
    { fileId } : FileIdParam, requestingUser : DecodedToken | null
) : Promise<FileDownload> => {

    const result = await pool.query<FileDownload>(
        `SELECT file_id, project_id, name, file_path, mime_type
        FROM files
        WHERE file_id = $1`,
        [fileId]
    );

    const file = result.rows[0];

    if (!file) throw new AppError(FILE_ERRORS.FILE_NOT_FOUND);

    if (requestingUser) await assertProjectAccess(file.project_id, requestingUser.user_id);

    return file;
};

// Análogo a getFileForDownloadService pero para la miniatura — separado
// en vez de reusar la misma query porque acá "no tiene thumbnail" es un
// caso esperado (no todo archivo es una imagen) que se resuelve con su
// propio error 404, distinto de "el archivo no existe".
export const getFileForThumbnailService = async (
    { fileId } : FileIdParam, requestingUser : DecodedToken | null
) : Promise<FileThumbnailDownload> => {

    const result = await pool.query<{ file_id : number; project_id : number; thumbnail_path : string | null }>(
        `SELECT file_id, project_id, thumbnail_path
        FROM files
        WHERE file_id = $1`,
        [fileId]
    );

    const file = result.rows[0];

    if (!file) throw new AppError(FILE_ERRORS.FILE_NOT_FOUND);

    if (requestingUser) await assertProjectAccess(file.project_id, requestingUser.user_id);

    if (!file.thumbnail_path) throw new AppError(FILE_ERRORS.THUMBNAIL_NOT_AVAILABLE);

    return { file_id: file.file_id, project_id: file.project_id, thumbnail_path: file.thumbnail_path };
};

// Borrar es más restrictivo que leer/listar (assertProjectAccess sola
// no alcanza): solo quien subió el archivo, o el dueño del proyecto,
// puede borrarlo — un miembro cualquiera no debería poder voltear
// archivos ajenos solo por estar en el proyecto. Un único DELETE con
// USING resuelve "existe + pertenece a este proyecto + tengo permiso"
// atómicamente; ON DELETE CASCADE (files -> ifc_files -> el resto) se
// encarga de todo lo derivado en la BD, acá solo queda borrar los
// bytes del disco aparte.
export const deleteFileService = async (
    { user_id : userId } : DecodedToken, { projectId, fileId } : ProjectFileIdParam
) : Promise<void> => {

    await assertProjectAccess(projectId, userId);

    const result = await pool.query<{ file_path : string; thumbnail_path : string | null }>(
        `DELETE FROM files f
        USING projects p
        WHERE f.project_id = p.project_id
            AND f.file_id = $1 AND f.project_id = $2
            AND (f.uploaded_by = $3 OR p.owner_id = $3)
        RETURNING f.file_path, f.thumbnail_path`,
        [fileId, projectId, userId]
    );

    const deleted = result.rows[0];

    if (!deleted) throw new AppError(FILE_ERRORS.FILE_NOT_FOUND);

    await fs.promises.rm(deleted.file_path, { force: true });
    if (deleted.thumbnail_path) await fs.promises.rm(deleted.thumbnail_path, { force: true });
};
