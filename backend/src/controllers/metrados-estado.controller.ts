import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import { getEstadoElementosService } from "../services/metrados-estado.service.js";
import type { EstadoElementosResult } from "../models/metrados-estado.models.js";
import type { Request, Response } from "express";

export const getEstadoElementosController = asyncHandler(
    async (req: Request, res: Response): Promise<void> => {

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const estado: EstadoElementosResult = await getEstadoElementosService(req.user, params.data);

        res.status(200).json(estado);
    }
);
