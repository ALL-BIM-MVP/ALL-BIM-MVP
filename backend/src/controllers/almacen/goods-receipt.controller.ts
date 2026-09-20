import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../../schemas/projects.schema.js";
import {
    CreateGoodsReceiptBodySchema, GoodsReceiptIdParamSchema, LinkGoodsReceiptPurchaseOrderBodySchema,
    ListGoodsReceiptsQuerySchema, SetGoodsReceiptFileBodySchema, UpdateGoodsReceiptBodySchema,
} from "../../schemas/almacen/goods-receipt.schema.js";
import {
    createGoodsReceiptService, getGoodsReceiptByIdService, linkGoodsReceiptPurchaseOrderService,
    listGoodsReceiptsService, setGoodsReceiptFileService, updateGoodsReceiptService,
} from "../../services/almacen/goods-receipt.service.js";

export const listGoodsReceiptsController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const query = ListGoodsReceiptsQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);

    res.status(200).json(await listGoodsReceiptsService(req.user, params.data, query.data));
});

export const getGoodsReceiptByIdController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = GoodsReceiptIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await getGoodsReceiptByIdService(req.user, params.data));
});

export const createGoodsReceiptController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CreateGoodsReceiptBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await createGoodsReceiptService(req.user, params.data, body.data));
});

export const updateGoodsReceiptController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = GoodsReceiptIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdateGoodsReceiptBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updateGoodsReceiptService(req.user, params.data, body.data));
});

export const linkGoodsReceiptPurchaseOrderController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = GoodsReceiptIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = LinkGoodsReceiptPurchaseOrderBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await linkGoodsReceiptPurchaseOrderService(req.user, params.data, body.data));
});

export const setGoodsReceiptFileController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = GoodsReceiptIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = SetGoodsReceiptFileBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await setGoodsReceiptFileService(req.user, params.data, body.data));
});
