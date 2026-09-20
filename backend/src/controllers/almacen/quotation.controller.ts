import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../../schemas/projects.schema.js";
import {
    CreateQuotationBodySchema, CreateQuotationItemBodySchema, ListQuotationsQuerySchema, QuotationIdParamSchema,
    QuotationItemIdParamSchema, SetQuotationFileBodySchema, UpdateQuotationBodySchema, UpdateQuotationItemBodySchema,
} from "../../schemas/almacen/quotation.schema.js";
import {
    addQuotationItemService, createQuotationService, deleteQuotationItemService, deleteQuotationService,
    getQuotationByIdService, listQuotationsService, setQuotationFileService, updateQuotationItemService,
    updateQuotationService,
} from "../../services/almacen/quotation.service.js";

export const listQuotationsController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const query = ListQuotationsQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);

    res.status(200).json(await listQuotationsService(req.user, params.data, query.data));
});

export const getQuotationByIdController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = QuotationIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await getQuotationByIdService(req.user, params.data));
});

export const createQuotationController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CreateQuotationBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await createQuotationService(req.user, params.data, body.data));
});

export const updateQuotationController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = QuotationIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdateQuotationBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updateQuotationService(req.user, params.data, body.data));
});

export const deleteQuotationController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = QuotationIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    await deleteQuotationService(req.user, params.data);
    res.status(204).send();
});

export const setQuotationFileController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = QuotationIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = SetQuotationFileBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await setQuotationFileService(req.user, params.data, body.data));
});

export const addQuotationItemController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = QuotationIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CreateQuotationItemBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await addQuotationItemService(req.user, params.data, body.data));
});

export const updateQuotationItemController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = QuotationItemIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdateQuotationItemBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updateQuotationItemService(req.user, params.data, body.data));
});

export const deleteQuotationItemController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = QuotationItemIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await deleteQuotationItemService(req.user, params.data));
});
