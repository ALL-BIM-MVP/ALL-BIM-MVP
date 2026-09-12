import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../../schemas/projects.schema.js";
import { listCategoriesService } from "../../services/almacen/category.service.js";

// Solo LISTAR — nada de crear/editar/borrar en esta versión (las 3
// filas fijas se crean solas al dar de alta el proyecto, ver
// category.service.ts). Fase 5 (categoría abierta) es la que habilita
// el resto de operaciones, a futuro.
export const listCategoriesController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await listCategoriesService(req.user, params.data));
});
