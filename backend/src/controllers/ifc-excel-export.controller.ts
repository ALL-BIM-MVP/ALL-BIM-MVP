import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { IfcFileIdParamSchema } from "../schemas/ifc-metrados.schema.js";
import { generateExcelExportService } from "../services/ifc-excel-export.service.js";
import type { FileFull } from "../models/files.models.js";

export const generateExcelExportController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = IfcFileIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const file : FileFull = await generateExcelExportService(req.user, params.data);
    res.status(201).json(file);
});
