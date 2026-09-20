import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../../schemas/projects.schema.js";
import { GoodsReceiptIdParamSchema } from "../../schemas/almacen/goods-receipt.schema.js";
import { GoodsIssueIdParamSchema } from "../../schemas/almacen/goods-issue.schema.js";
import {
    AdjustmentIdParamSchema, CorrectGoodsIssueBodySchema, CorrectGoodsReceiptBodySchema, ListAdjustmentsQuerySchema,
    VoidDocumentBodySchema,
} from "../../schemas/almacen/inventory-adjustment.schema.js";
import {
    correctGoodsIssueService, correctGoodsReceiptService, getAdjustmentByIdService, listAdjustmentsService,
    voidGoodsIssueService, voidGoodsReceiptService,
} from "../../services/almacen/inventory-adjustment.service.js";

export const correctGoodsReceiptController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = GoodsReceiptIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CorrectGoodsReceiptBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await correctGoodsReceiptService(req.user, { projectId: params.data.projectId }, params.data.goodsReceiptId, body.data));
});

export const voidGoodsReceiptController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = GoodsReceiptIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = VoidDocumentBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await voidGoodsReceiptService(req.user, { projectId: params.data.projectId }, params.data.goodsReceiptId, body.data));
});

export const correctGoodsIssueController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = GoodsIssueIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CorrectGoodsIssueBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await correctGoodsIssueService(req.user, { projectId: params.data.projectId }, params.data.goodsIssueId, body.data));
});

export const voidGoodsIssueController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = GoodsIssueIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = VoidDocumentBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await voidGoodsIssueService(req.user, { projectId: params.data.projectId }, params.data.goodsIssueId, body.data));
});

export const listAdjustmentsController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const query = ListAdjustmentsQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);

    res.status(200).json(await listAdjustmentsService(req.user, params.data, query.data));
});

export const getAdjustmentController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = AdjustmentIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await getAdjustmentByIdService(req.user, params.data));
});
