import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { BinContentIdParamSchema, BinIdParamSchema, UpdateBinBodySchema, UpdateBinContentPoseBodySchema } from "../../schemas/almacen/bin.schema.js";
import { updateBinContentPoseService, updateBinService } from "../../services/almacen/bin.service.js";

// Única mutación de bin en esta fase — se generan solas con su rack
// (ver rack.controller.ts, createRackController).
export const updateBinController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = BinIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdateBinBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updateBinService(req.user, params.data, body.data));
});

// Ajuste fino de posición/rotación/escala de un contenido dentro de su casilla — nunca
// cuánto hay (eso es ingreso/vale/ajuste). Ver el comentario grande en bin.service.ts.
export const updateBinContentPoseController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = BinContentIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdateBinContentPoseBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updateBinContentPoseService(req.user, params.data, body.data));
});
