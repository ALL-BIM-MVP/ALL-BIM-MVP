import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import type { FileIdParam, FileType, GetProjectFilesQuery } from "../schemas/file.schema.js";
import { transformFileToFull, type FileDownload, type FileFull, type FileRow } from "../models/files.models.js";
import { AppError } from "../models/errors/app-error.js";
import { PROJECT_ERRORS } from "../models/errors/project.errors.js";
import { FILE_ERRORS } from "../models/errors/files.errors.js";

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

const computeChecksum = (filePath : string) : Promise<string> => {
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

        const result = await pool.query<FileRow>(
            `INSERT INTO
                files(project_id, file_type, name, file_path, file_size, checksum, mime_type, uploaded_by)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING
                file_id, project_id, file_type, name, file_size, checksum, mime_type, uploaded_at,
                NULL AS ifc_status, NULL AS ifc_error_message,
                uploaded_by AS user_id,
                (SELECT name FROM users WHERE user_id = uploaded_by) AS user_name,
                (SELECT email FROM users WHERE user_id = uploaded_by) AS user_email`,
            [projectId, fileType, multerFile.originalname, multerFile.path, multerFile.size, checksum, multerFile.mimetype, uploadedBy]
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
        ORDER BY f.uploaded_at DESC`,
        [projectId, fileType ?? null, processed ?? null]
    );

    return result.rows.map((f) => transformFileToFull(f));
};

export const getFileForDownloadService = async (
    { user_id : userId } : DecodedToken, { fileId } : FileIdParam
) : Promise<FileDownload> => {

    const result = await pool.query<FileDownload>(
        `SELECT file_id, project_id, name, file_path, mime_type
        FROM files
        WHERE file_id = $1`,
        [fileId]
    );

    const file = result.rows[0];

    if (!file) throw new AppError(FILE_ERRORS.FILE_NOT_FOUND);

    await assertProjectAccess(file.project_id, userId);

    return file;
};
