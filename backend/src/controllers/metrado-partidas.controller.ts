import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { IfcFileIdParamSchema, PartidaElementsBodySchema, PartidaIdParamSchema } from "../schemas/ifc-metrados.schema.js";
import { getPartidaElementsService, getPartidasTreeService } from "../services/metrado-partidas.service.js";
import type { PartidaElementsDetail, PartidaTreeNode } from "../models/metrado-partidas.models.js";
import type { Request, Response } from "express";


export const getPartidasTreeController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = IfcFileIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const tree : PartidaTreeNode[] = await getPartidasTreeService(req.user, params.data);

        res.status(200).json(tree);
});

export const getPartidaElementsController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = PartidaIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const body = PartidaElementsBodySchema.safeParse(req.body ?? {});

        if (!body.success) {
            throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
        }

        const detail : PartidaElementsDetail = await getPartidaElementsService(req.user, params.data, body.data);

        res.status(200).json(detail);
});
