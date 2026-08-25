import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import { ElementoConjuntoConfigBodySchema } from "../schemas/elemento-conjunto.schema.js";
import {
    getAvailableElementoConjuntoFieldsService, getElementoConjuntoConfigService,
    upsertElementoConjuntoConfigService,
} from "../services/elemento-conjunto.service.js";
import type { AvailableElementoConjuntoFields, ElementoConjuntoConfigFull } from "../models/elemento-conjunto.models.js";

export const getElementoConjuntoConfigController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const config : ElementoConjuntoConfigFull = await getElementoConjuntoConfigService(req.user, params.data);
    res.status(200).json(config);
});

export const upsertElementoConjuntoConfigController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = ElementoConjuntoConfigBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    const config : ElementoConjuntoConfigFull = await upsertElementoConjuntoConfigService(req.user, params.data, body.data);
    res.status(200).json(config);
});

export const getAvailableElementoConjuntoFieldsController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const fields : AvailableElementoConjuntoFields = await getAvailableElementoConjuntoFieldsService(req.user, params.data);
    res.status(200).json(fields);
});
