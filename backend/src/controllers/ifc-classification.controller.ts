import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import { IfcClassificationConfigBodySchema } from "../schemas/ifc-classification.schema.js";
import {
    getIfcClassificationConfigService, upsertIfcClassificationConfigService,
} from "../services/ifc-classification.service.js";
import type { IfcClassificationConfigFull } from "../models/ifc-classification.models.js";

export const getIfcClassificationConfigController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const config : IfcClassificationConfigFull = await getIfcClassificationConfigService(req.user, params.data);
    res.status(200).json(config);
});

export const upsertIfcClassificationConfigController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = IfcClassificationConfigBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    const config : IfcClassificationConfigFull = await upsertIfcClassificationConfigService(req.user, params.data, body.data);
    res.status(200).json(config);
});
