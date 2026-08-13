import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    CreateTemplateBodySchema, ListTemplatesQuerySchema, TemplateColumnIdParamSchema,
    TemplateIdParamSchema, ToggleColumnVisibilityBodySchema, UpdateTemplateColumnsBodySchema
} from "../schemas/templates.schema.js";
import { IfcFileIdParamSchema } from "../schemas/ifc-metrados.schema.js";
import {
    createTemplateService, getAvailableColumnsService, getTemplateByIdService, listTemplatesService,
    toggleTemplateColumnVisibilityService, updateTemplateColumnsService
} from "../services/templates.service.js";
import type { AvailableColumnsCatalog, TemplateColumn, TemplateFull, TemplateRow } from "../models/templates.models.js";
import type { Request, Response } from "express";


export const getTemplateByIdController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = TemplateIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const template : TemplateFull = await getTemplateByIdService(req.user, params.data);

        res.status(200).json(template);
});

export const createTemplateController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const body = CreateTemplateBodySchema.safeParse(req.body);

        if (!body.success) {
            throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
        }

        const template : TemplateFull = await createTemplateService(req.user, body.data);

        res.status(201).json(template);
});

export const listTemplatesController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const query = ListTemplatesQuerySchema.safeParse(req.query);

        if (!query.success) {
            throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);
        }

        const templates : TemplateRow[] = await listTemplatesService(req.user, query.data);

        res.status(200).json(templates);
});

export const updateTemplateColumnsController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = TemplateIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const body = UpdateTemplateColumnsBodySchema.safeParse(req.body);

        if (!body.success) {
            throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
        }

        const template : TemplateFull = await updateTemplateColumnsService(req.user, params.data, body.data);

        res.status(200).json(template);
});

export const toggleTemplateColumnVisibilityController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = TemplateColumnIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const body = ToggleColumnVisibilityBodySchema.safeParse(req.body);

        if (!body.success) {
            throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
        }

        const column : TemplateColumn = await toggleTemplateColumnVisibilityService(req.user, params.data, body.data);

        res.status(200).json(column);
});

// Mapea a GET /ifc-files/:ifcFileId/available-columns (se monta en
// ifcFilesRouter, no en el router de /api/templates) — vive acá porque
// el catálogo que arma es 100% del dominio de plantillas.
export const getAvailableColumnsController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = IfcFileIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const catalog : AvailableColumnsCatalog = await getAvailableColumnsService(req.user, params.data);

        res.status(200).json(catalog);
});
