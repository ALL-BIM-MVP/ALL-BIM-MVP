import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../models/errors/app-error.js";
import type { ProjectMemberListItem } from "../models/project-members.models.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import {
    getListProjectMembersService, removeProjectMemberService,
    setMemberAdminService, setMemberModuleRoleService,
} from "../services/project-members.service.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import {
    ProjectMemberIdParamSchema, ProjectMemberModuleParamSchema, ProjectMemberUserParamSchema,
    SetMemberAdminSchema, SetMemberModuleRoleSchema,
} from "../schemas/project-members.schema.js";

export const getListProjectMembersController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const projectParam = ProjectIdParamSchema.safeParse(req.params);

        if (!projectParam.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const membersOfProject : ProjectMemberListItem[] = await getListProjectMembersService(req.user, projectParam.data);

        res.status(200).json(membersOfProject);
});

export const setMemberAdminController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectMemberIdParamSchema.safeParse(req.params);
        if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

        const body = SetMemberAdminSchema.safeParse(req.body);
        if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

        await setMemberAdminService(req.user, params.data, body.data);

        res.status(200).json({ message : "Rol de administrador actualizado correctamente." });
});

export const setMemberModuleRoleController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectMemberModuleParamSchema.safeParse(req.params);
        if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ROUTE_PARAMS);

        const body = SetMemberModuleRoleSchema.safeParse(req.body);
        if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

        await setMemberModuleRoleService(req.user, params.data, body.data);

        res.status(200).json({ message : "Rol de módulo asignado correctamente." });
});

export const removeProjectMemberController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectMemberUserParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        await removeProjectMemberService(req.user, params.data);

        res.status(200).json({ message : "El miembro ha sido removido del proyecto con exito."});
});
