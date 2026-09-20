import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { TraceabilityParamSchema, TraceabilityQuerySchema } from "../../schemas/almacen/traceability.schema.js";
import { getTraceabilityService } from "../../services/almacen/traceability.service.js";

export const getTraceabilityController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = TraceabilityParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const query = TraceabilityQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);

    res.status(200).json(await getTraceabilityService(req.user, params.data, query.data));
});
