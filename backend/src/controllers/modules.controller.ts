import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { ModuleCodeParamSchema, ProjectModuleCodeParamSchema } from "../schemas/modules.schema.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import {
    getModuleAccessService, getModuleRolesService, getModulesService, getMyModulesAccessService,
} from "../services/modules.service.js";
import type { ModuleAccess, ModuleRoleCatalogEntry, ModuleSummary } from "../models/modules.models.js";

export const getModulesController = asyncHandler( async (_req : Request, res : Response) : Promise<void> => {
    const modules : ModuleSummary[] = await getModulesService();
    res.status(200).json(modules);
});

export const getModuleRolesController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const params = ModuleCodeParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ROUTE_PARAMS);

    const roles : ModuleRoleCatalogEntry[] = await getModuleRolesService(params.data);
    res.status(200).json(roles);
});

export const getModuleAccessController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectModuleCodeParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ROUTE_PARAMS);

    const access : ModuleAccess = await getModuleAccessService(req.user, params.data);
    res.status(200).json(access);
});

export const getMyModulesAccessController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const access : ModuleAccess[] = await getMyModulesAccessService(req.user, params.data);
    res.status(200).json(access);
});
