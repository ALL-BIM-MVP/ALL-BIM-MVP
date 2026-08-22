import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import { getIfcSpecialtiesService, listIfcDocumentsService } from "../services/ifc-documents.service.js";
import type { IfcDocumentFull, IfcSpecialtyFull } from "../models/ifc-documents.models.js";

export const getIfcSpecialtiesController = asyncHandler( async (_req : Request, res : Response) : Promise<void> => {
    const specialties : IfcSpecialtyFull[] = await getIfcSpecialtiesService();
    res.status(200).json(specialties);
});

export const listIfcDocumentsController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const documents : IfcDocumentFull[] = await listIfcDocumentsService(req.user, params.data);
    res.status(200).json(documents);
});
