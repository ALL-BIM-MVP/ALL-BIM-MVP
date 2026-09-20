import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../../schemas/projects.schema.js";
import {
    CreatePurchaseOrderBodySchema, CreatePurchaseOrderItemBodySchema, ListPurchaseOrdersQuerySchema,
    PurchaseOrderIdParamSchema, PurchaseOrderItemIdParamSchema, SetPurchaseOrderFileBodySchema,
    UpdatePurchaseOrderBodySchema, UpdatePurchaseOrderItemBodySchema,
} from "../../schemas/almacen/purchase-order.schema.js";
import {
    addPurchaseOrderItemService, createPurchaseOrderService, deletePurchaseOrderItemService,
    deletePurchaseOrderService, getPurchaseOrderByIdService, listPurchaseOrdersService,
    setPurchaseOrderFileService, updatePurchaseOrderItemService, updatePurchaseOrderService,
} from "../../services/almacen/purchase-order.service.js";

export const listPurchaseOrdersController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const query = ListPurchaseOrdersQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);

    res.status(200).json(await listPurchaseOrdersService(req.user, params.data, query.data));
});

export const getPurchaseOrderByIdController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseOrderIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await getPurchaseOrderByIdService(req.user, params.data));
});

export const createPurchaseOrderController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CreatePurchaseOrderBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await createPurchaseOrderService(req.user, params.data, body.data));
});

export const updatePurchaseOrderController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseOrderIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdatePurchaseOrderBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updatePurchaseOrderService(req.user, params.data, body.data));
});

export const deletePurchaseOrderController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseOrderIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    await deletePurchaseOrderService(req.user, params.data);
    res.status(204).send();
});

export const setPurchaseOrderFileController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseOrderIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = SetPurchaseOrderFileBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await setPurchaseOrderFileService(req.user, params.data, body.data));
});

export const addPurchaseOrderItemController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseOrderIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CreatePurchaseOrderItemBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await addPurchaseOrderItemService(req.user, params.data, body.data));
});

export const updatePurchaseOrderItemController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseOrderItemIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdatePurchaseOrderItemBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updatePurchaseOrderItemService(req.user, params.data, body.data));
});

export const deletePurchaseOrderItemController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = PurchaseOrderItemIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await deletePurchaseOrderItemService(req.user, params.data));
});
