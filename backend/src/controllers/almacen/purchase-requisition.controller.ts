import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../../schemas/projects.schema.js";
import {
    CreatePurchaseRequisitionBodySchema, CreatePurchaseRequisitionItemBodySchema,
    ListPurchaseRequisitionsQuerySchema, PurchaseRequisitionIdParamSchema, PurchaseRequisitionItemIdParamSchema,
    SetPurchaseRequisitionFileBodySchema, UpdatePurchaseRequisitionBodySchema,
    UpdatePurchaseRequisitionItemBodySchema,
} from "../../schemas/almacen/purchase-requisition.schema.js";
import {
    addPurchaseRequisitionItemService, createPurchaseRequisitionService, deletePurchaseRequisitionItemService,
    deletePurchaseRequisitionService, getPurchaseRequisitionByIdService, listPurchaseRequisitionsService,
    setPurchaseRequisitionFileService, updatePurchaseRequisitionItemService, updatePurchaseRequisitionService,
} from "../../services/almacen/purchase-requisition.service.js";

export const listPurchaseRequisitionsController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const query = ListPurchaseRequisitionsQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);

    res.status(200).json(await listPurchaseRequisitionsService(req.user, params.data, query.data));
});

export const getPurchaseRequisitionByIdController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseRequisitionIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await getPurchaseRequisitionByIdService(req.user, params.data));
});

export const createPurchaseRequisitionController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CreatePurchaseRequisitionBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await createPurchaseRequisitionService(req.user, params.data, body.data));
});

export const updatePurchaseRequisitionController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseRequisitionIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdatePurchaseRequisitionBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updatePurchaseRequisitionService(req.user, params.data, body.data));
});

export const deletePurchaseRequisitionController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseRequisitionIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    await deletePurchaseRequisitionService(req.user, params.data);
    res.status(204).send();
});

export const setPurchaseRequisitionFileController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseRequisitionIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = SetPurchaseRequisitionFileBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await setPurchaseRequisitionFileService(req.user, params.data, body.data));
});

export const addPurchaseRequisitionItemController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseRequisitionIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CreatePurchaseRequisitionItemBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await addPurchaseRequisitionItemService(req.user, params.data, body.data));
});

export const updatePurchaseRequisitionItemController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseRequisitionItemIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdatePurchaseRequisitionItemBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updatePurchaseRequisitionItemService(req.user, params.data, body.data));
});

export const deletePurchaseRequisitionItemController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseRequisitionItemIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await deletePurchaseRequisitionItemService(req.user, params.data));
});
