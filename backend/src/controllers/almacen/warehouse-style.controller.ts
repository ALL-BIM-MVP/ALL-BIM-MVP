import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { listWarehouseStylesService } from "../../services/almacen/warehouse-style.service.js";

// Catálogo global — mismo criterio que getIfcSpecialtiesController:
// cualquier cuenta autenticada puede leerlo, no depende de ningún
// proyecto.
export const listWarehouseStylesController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    res.status(200).json(await listWarehouseStylesService());
});
