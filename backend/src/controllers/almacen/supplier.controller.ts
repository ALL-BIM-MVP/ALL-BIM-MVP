import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../../schemas/projects.schema.js";
import {
    CreateSupplierBodySchema, ListSuppliersQuerySchema, SupplierIdParamSchema, UpdateSupplierBodySchema,
} from "../../schemas/almacen/supplier.schema.js";
import {
    createSupplierService, deleteSupplierService, getSupplierByIdService, listSuppliersService, updateSupplierService,
} from "../../services/almacen/supplier.service.js";

export const listSuppliersController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const query = ListSuppliersQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);

    res.status(200).json(await listSuppliersService(req.user, params.data, query.data));
});

export const getSupplierByIdController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = SupplierIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await getSupplierByIdService(req.user, params.data));
});

export const createSupplierController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = CreateSupplierBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(201).json(await createSupplierService(req.user, params.data, body.data));
});

export const updateSupplierController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = SupplierIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = UpdateSupplierBodySchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    res.status(200).json(await updateSupplierService(req.user, params.data, body.data));
});

export const deleteSupplierController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = SupplierIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    await deleteSupplierService(req.user, params.data);
    res.status(204).send();
});
