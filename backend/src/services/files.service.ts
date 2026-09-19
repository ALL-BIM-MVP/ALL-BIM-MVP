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
import { FILE_ERRORS } from "../models/errors/files.errors.js";
import { generateThumbnail } from "../utils/thumbnail.js";
import { assertModulePermission, assertProjectAccess, resolveModuleAccess } from "./project-access.service.js";

// Se conserva el export desde acá: la definición vive ahora en
// project-access.service.ts (ver el comentario ahí).
export { assertProjectAccess };

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

// Exportado: lo reusan las exportaciones/generaciones del backend que
// guardan un archivo propio (Excel exportado, .frag).
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

// Todo archivo es de UN proyecto y de UN módulo (files.module_id). Los
// permisos se resuelven con el mismo mecanismo que el resto de la app
// (assertModulePermission: dueño/administrador siempre pasan, el resto
// según su rol en ESE módulo, mínimo "ver"), no con un criterio propio
// de archivos.

// Códigos de los módulos ACTIVOS donde el usuario tiene "ver" en este
// proyecto — hoy todo miembro tiene "ver" por defecto en todos los
// módulos (decisión con el cliente), así que esto solo restringiría si
// algún día un rol/ausencia de rol deja a alguien sin "ver".
const getViewableModuleCodes = async (projectId : number, userId : number) : Promise<string[]> => {
    const modules = await pool.query<{ code : string }>(
        `SELECT code FROM modules WHERE is_active = true ORDER BY module_id`
    );

    const viewable : string[] = [];
    for (const { code } of modules.rows) {
        const access = await resolveModuleAccess(projectId, userId, code);
        if (access.permissions.view) viewable.push(code);
    }
    return viewable;
};

// Subida manual: moduleCode viene SIEMPRE del cliente (obligatorio, ver
// saveFileBodySchema) — el backend nunca asume uno. Las subidas que hace
// el propio backend (IFC de Metrados) pasan METRADOS_MODULE_CODE.
export const saveFileService = async (
    { user_id : uploadedBy } : DecodedToken, { projectId } : ProjectIdParam,
    moduleCode : string, fileTypeOverride : FileType | undefined, multerFile : Express.Multer.File
) : Promise<FileFull> => {

    const fileType = fileTypeOverride ?? inferFileType(multerFile.originalname);

    try {
        // Subir exige el permiso "upload" del módulo dueño del archivo —
        // ser miembro del proyecto ya no alcanza. Además valida que el
        // módulo exista y esté activo, y que el usuario sea del proyecto.
        await assertModulePermission(projectId, uploadedBy, moduleCode, "upload");
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

        // $10 = código del módulo: assertModulePermission ya confirmó que
        // existe y está activo, así que el subselect siempre resuelve.
        const result = await pool.query<FileRow>(
            `INSERT INTO
                files(project_id, file_type, name, file_path, file_size, checksum, mime_type, uploaded_by, thumbnail_path, module_id)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, (SELECT module_id FROM modules WHERE code = $10))
            RETURNING
                file_id, project_id, $10::VARCHAR AS module_code, file_type, name, file_size, checksum, mime_type,
                uploaded_at, thumbnail_path,
                NULL AS ifc_status, NULL AS ifc_error_message,
                NULL AS ifc_document_id, NULL AS ifc_document_name, NULL AS version_number, NULL AS is_current,
                NULL AS specialty_code, NULL AS specialty_name,
                uploaded_by AS user_id,
                (SELECT name FROM users WHERE user_id = uploaded_by) AS user_name,
                (SELECT last_name FROM users WHERE user_id = uploaded_by) AS user_last_name,
                (SELECT email FROM users WHERE user_id = uploaded_by) AS user_email`,
            [projectId, fileType, multerFile.originalname, multerFile.path, multerFile.size, checksum, multerFile.mimetype, uploadedBy, thumbnailPath, moduleCode]
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
    { file_type : fileType, processed, only_current : onlyCurrent, module_code : moduleCode } : GetProjectFilesQuery
) : Promise<FileFull[]> => {

    await assertProjectAccess(projectId, userId);

    // Con ?module_code= se exige "ver" en ESE módulo; sin él se listan los
    // archivos de todos los módulos donde el usuario tiene "ver".
    let moduleCodes : string[];
    if (moduleCode) {
        await assertModulePermission(projectId, userId, moduleCode, "view");
        moduleCodes = [moduleCode];
    } else {
        moduleCodes = await getViewableModuleCodes(projectId, userId);
    }

    const result = await pool.query<FileRow>(
        `SELECT
            f.file_id, f.project_id, m.code AS module_code, f.file_type, f.name, f.file_size, f.checksum,
            f.mime_type, f.uploaded_at,
            f.thumbnail_path,
            i.status AS ifc_status, i.error_message AS ifc_error_message,
            i.ifc_document_id, d.name AS ifc_document_name, i.version_number, i.is_current,
            s.code AS specialty_code, s.name AS specialty_name,
            u.user_id, u.name AS user_name, u.last_name AS user_last_name, u.email AS user_email
        FROM files f
        INNER JOIN modules m ON m.module_id = f.module_id
        LEFT JOIN ifc_files i ON i.ifc_file_id = f.file_id
        LEFT JOIN ifc_documents d ON d.ifc_document_id = i.ifc_document_id
        LEFT JOIN ifc_specialties s ON s.ifc_specialty_id = d.specialty_id
        INNER JOIN users u ON u.user_id = f.uploaded_by
        WHERE f.project_id = $1
            AND m.code = ANY($5::VARCHAR[])
            AND ($2::VARCHAR IS NULL OR f.file_type = $2)
            -- Migración del visor a ThatOpen (ver
            -- docs/roadmap/migracion-visor-thatopen-backend.md) — el
            -- .frag es puramente técnico (para el visor), nadie lo sube
            -- ni lo pide a mano; no tiene sentido mezclarlo en el
            -- listado de archivos del proyecto con nombre de UUID
            -- ilegible. Se descarga siempre por fragments_file_id (GET
            -- /ifc-files/:id, B3), nunca navegando este listado —
            -- incondicional, ni siquiera pidiendo ?file_type=fragments
            -- a propósito.
            AND f.file_type != 'fragments'
            AND (
                $3::BOOLEAN IS NULL                                             -- no se pidió filtro de procesado
                OR ($3 = true  AND i.status = 'done')
                OR ($3 = false AND f.file_type = 'ifc'                          -- processed=false siempre implica ifc
                    AND (i.ifc_file_id IS NULL OR i.status = 'error'))
            )
            AND (
                $4::BOOLEAN IS NULL OR $4 = false                               -- no se pidió only_current
                OR i.ifc_file_id IS NULL                                        -- no es ifc, no se filtra
                OR i.is_current = true
            )
        ORDER BY f.uploaded_at DESC`,
        [projectId, fileType ?? null, processed ?? null, onlyCurrent ?? null, moduleCodes]
    );

    return result.rows.map((f) => transformFileToFull(f));
};

// requestingUser=null significa "ya autorizado por un ?token= firmado"
// (ver middlewares/file-access.middleware.ts) — la firma demostró
// autorización en el momento en que se generó (al armar la lista, con
// el permiso ya corrido ahí), así que acá NO se vuelve a golpear la BD
// para chequear membresía/permisos. Con un DecodedToken sí se corre
// igual que siempre (consumo por Authorization: Bearer): exige "ver" en
// el módulo dueño del archivo.
export const getFileForDownloadService = async (
    { fileId } : FileIdParam, requestingUser : DecodedToken | null
) : Promise<FileDownload> => {

    const result = await pool.query<FileDownload & { module_code : string }>(
        `SELECT f.file_id, f.project_id, f.name, f.file_path, f.mime_type, m.code AS module_code
        FROM files f
        INNER JOIN modules m ON m.module_id = f.module_id
        WHERE f.file_id = $1`,
        [fileId]
    );

    const file = result.rows[0];

    if (!file) throw new AppError(FILE_ERRORS.FILE_NOT_FOUND);

    if (requestingUser) await assertModulePermission(file.project_id, requestingUser.user_id, file.module_code, "view");

    return file;
};

// Análogo a getFileForDownloadService pero para la miniatura — separado
// en vez de reusar la misma query porque acá "no tiene thumbnail" es un
// caso esperado (no todo archivo es una imagen) que se resuelve con su
// propio error 404, distinto de "el archivo no existe".
export const getFileForThumbnailService = async (
    { fileId } : FileIdParam, requestingUser : DecodedToken | null
) : Promise<FileThumbnailDownload> => {

    const result = await pool.query<{
        file_id : number; project_id : number; thumbnail_path : string | null; module_code : string
    }>(
        `SELECT f.file_id, f.project_id, f.thumbnail_path, m.code AS module_code
        FROM files f
        INNER JOIN modules m ON m.module_id = f.module_id
        WHERE f.file_id = $1`,
        [fileId]
    );

    const file = result.rows[0];

    if (!file) throw new AppError(FILE_ERRORS.FILE_NOT_FOUND);

    if (requestingUser) await assertModulePermission(file.project_id, requestingUser.user_id, file.module_code, "view");

    if (!file.thumbnail_path) throw new AppError(FILE_ERRORS.THUMBNAIL_NOT_AVAILABLE);

    return { file_id: file.file_id, project_id: file.project_id, thumbnail_path: file.thumbnail_path };
};

// Borrar es más restrictivo que leer/listar: exige el permiso "delete"
// del módulo dueño del archivo Y ser quien lo subió o el dueño del
// proyecto — un miembro cualquiera no debería poder voltear archivos
// ajenos solo por estar en el proyecto. Un único DELETE con USING
// resuelve "existe + pertenece a este proyecto + tengo permiso"
// atómicamente; ON DELETE CASCADE (files -> ifc_files -> el resto) se
// encarga de todo lo derivado en la BD, acá solo queda borrar los
// bytes del disco aparte.
export const deleteFileService = async (
    { user_id : userId } : DecodedToken, { projectId, fileId } : ProjectFileIdParam
) : Promise<void> => {

    await assertProjectAccess(projectId, userId);

    const moduleResult = await pool.query<{ module_code : string }>(
        `SELECT m.code AS module_code
        FROM files f
        INNER JOIN modules m ON m.module_id = f.module_id
        WHERE f.file_id = $1 AND f.project_id = $2`,
        [fileId, projectId]
    );
    const fileModule = moduleResult.rows[0];

    if (!fileModule) throw new AppError(FILE_ERRORS.FILE_NOT_FOUND);

    await assertModulePermission(projectId, userId, fileModule.module_code, "delete");

    // Fase 5 (Excel ligado al IFC) — si este archivo es un IFC del que
    // se generaron Excel (files.generated_from_ifc_file_id), el DELETE
    // de abajo se los va a llevar puestos en la BD (ON DELETE CASCADE),
    // pero eso no borra sus BYTES del disco — hay que juntar sus paths
    // ANTES de borrar la fila, después ya no hay de dónde sacarlos.
    const generatedResult = await pool.query<{ file_path : string; thumbnail_path : string | null }>(
        `SELECT file_path, thumbnail_path FROM files WHERE generated_from_ifc_file_id = $1`,
        [fileId]
    );

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

    for (const generated of generatedResult.rows) {
        await fs.promises.rm(generated.file_path, { force: true });
        if (generated.thumbnail_path) await fs.promises.rm(generated.thumbnail_path, { force: true });
    }

    // Si el archivo borrado era una versión de un ifc_documents (Fase
    // 3), el DELETE de arriba ya se llevó su fila ifc_files (ON DELETE
    // CASCADE files -> ifc_files). Si esa era la ÚLTIMA versión del
    // documento, el documento queda sin ninguna razón para seguir
    // existiendo — sin este barrido quedaría fantasma para siempre en
    // GET /projects/:id/ifc-documents (0 versiones, nunca elegible como
    // replaces_ifc_document_id). No-op barato el resto de las veces.
    await pool.query(
        `DELETE FROM ifc_documents d
        WHERE d.project_id = $1
            AND NOT EXISTS (SELECT 1 FROM ifc_files i WHERE i.ifc_document_id = d.ifc_document_id)`,
        [projectId]
    );

    await fs.promises.rm(deleted.file_path, { force: true });
    if (deleted.thumbnail_path) await fs.promises.rm(deleted.thumbnail_path, { force: true });
};
