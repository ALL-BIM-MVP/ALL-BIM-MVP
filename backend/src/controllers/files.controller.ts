import fs from "node:fs/promises";
import path from "node:path";
import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { FILE_ERRORS } from "../models/errors/files.errors.js";
import {
    deleteFileService, getFileForDownloadService, getFileForThumbnailService,
    getProjectFilesService, saveFileService
} from "../services/files.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import {
    FileContentQuerySchema, FileIdParamSchema, GetProjectFilesQuerySchema,
    ProjectFileIdParamSchema, saveFileBodySchema
} from "../schemas/file.schema.js";
import type { FileFull } from "../models/files.models.js";
import type { Request, Response } from "express";


export const saveFileController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectIdParamSchema.safeParse(req.params);

        if (!params.success) {
            if (req.file) await fs.rm(req.file.path, { force: true });
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        if (!req.file) {
            throw new AppError(FILE_ERRORS.FILE_NOT_PROVIDED);
        }

        const body = saveFileBodySchema.safeParse(req.body ?? {});

        if (!body.success) {
            await fs.rm(req.file.path, { force: true });
            throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
        }

        const fileInfo : FileFull = await saveFileService(req.user, params.data, body.data.file_type, req.file);

        res.status(201).json(fileInfo);
});

export const getProjectFilesController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const query = GetProjectFilesQuerySchema.safeParse(req.query);

        if (!query.success) {
            throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);
        }

        const files : FileFull[] = await getProjectFilesService(req.user, params.data, query.data);

        res.status(200).json(files);
});

export const getFileContentController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        // authorizeFileAccess ya garantizó UNO de los dos: req.user
        // (Bearer normal) o req.fileAccessGrant (?token= firmado, ver
        // middlewares/file-access.middleware.ts) — este chequeo es solo
        // defensivo, no debería poder fallar si la ruta usa ese
        // middleware.
        if (!req.user && !req.fileAccessGrant) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = FileIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const query = FileContentQuerySchema.safeParse(req.query);

        if (!query.success) {
            throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);
        }

        const file = await getFileForDownloadService(params.data, req.user ?? null);

        const absolutePath = path.resolve(file.file_path);
        const existsOnDisk = await fs.access(absolutePath).then(() => true).catch(() => false);

        if (!existsOnDisk) {
            throw new AppError(FILE_ERRORS.FILE_MISSING_ON_DISK);
        }

        res.type(file.mime_type ?? "application/octet-stream");

        if (query.data.download) {
            await new Promise<void>((resolve, reject) => {
                res.download(absolutePath, file.name, (err) => err ? reject(err) : resolve());
            });
            return;
        }

        await new Promise<void>((resolve, reject) => {
            res.sendFile(absolutePath, (err) => err ? reject(err) : resolve());
        });
});

// Sin query params (a diferencia de content, que soporta ?download) —
// una miniatura solo se usa para previsualizar inline, nunca para
// descargar. Siempre JPEG porque generateThumbnail() la genera así.
export const getFileThumbnailController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user && !req.fileAccessGrant) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = FileIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const file = await getFileForThumbnailService(params.data, req.user ?? null);

        const absolutePath = path.resolve(file.thumbnail_path);
        const existsOnDisk = await fs.access(absolutePath).then(() => true).catch(() => false);

        if (!existsOnDisk) {
            throw new AppError(FILE_ERRORS.FILE_MISSING_ON_DISK);
        }

        res.type("image/jpeg");

        await new Promise<void>((resolve, reject) => {
            res.sendFile(absolutePath, (err) => err ? reject(err) : resolve());
        });
});

export const deleteFileController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectFileIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        await deleteFileService(req.user, params.data);

        res.status(200).json({ message: "El archivo fue eliminado correctamente." });
});
