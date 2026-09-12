import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { CasillaIdParamSchema, UpdateCasillaBodySchema } from "../../schemas/almacen/casilla.schema.js";
import { updateCasillaService } from "../../services/almacen/casilla.service.js";

// Única mutación de casilla en esta fase — se generan solas con su
// estante (ver estante.controller.ts, createEstanteController).
export const updateCasillaController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = CasillaIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdateCasillaBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updateCasillaService(req.user, params.data, body.data));
});
