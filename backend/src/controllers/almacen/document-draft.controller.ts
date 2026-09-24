import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../../schemas/projects.schema.js";
import { CreateDocumentDraftBodySchema } from "../../schemas/almacen/document-draft.schema.js";
import { createDocumentDraftService } from "../../services/almacen/document-draft.service.js";

export const createDocumentDraftController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CreateDocumentDraftBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await createDocumentDraftService(req.user, params.data, body.data));
});
