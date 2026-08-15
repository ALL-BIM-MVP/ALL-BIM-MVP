import fs from "node:fs/promises";
import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { FILE_ERRORS } from "../models/errors/files.errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import { deleteProjectCoverImageService, setProjectCoverImageService } from "../services/project-images.service.js";
import type { ProjectCoverImage, ProjectCoverImageInfo } from "../models/project-images.models.js";
import type { Request, Response } from "express";

// No hay controller de GET acá — leer la portada viaja embebida en
// GET /projects y GET /projects/:id (cover_image.url), servida por el
// mount estático público de /uploads (ver index.ts). Este archivo solo
// tiene las dos mutaciones (fijar / borrar), que sí requieren ser el
// dueño del proyecto.

export const setProjectCoverImageController = asyncHandler (
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

        const image : ProjectCoverImageInfo = await setProjectCoverImageService(req.user, params.data, req.file);

        res.status(200).json(image);
});

export const deleteProjectCoverImageController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const image : ProjectCoverImage = await deleteProjectCoverImageService(req.user, params.data);

        res.status(200).json(image);
});
