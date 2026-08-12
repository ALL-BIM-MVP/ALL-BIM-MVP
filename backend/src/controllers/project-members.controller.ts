import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../models/errors/app-error.js";
import type { CurrentUserProjectRole, ProjectMemberFull, ProjectMemberListItem } from "../models/project-members.models.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import {
    getCurrentUserProjectRoleService, getListProjectMembersService,
    removeProjectMemberService, updateProjectMemberRoleService
} from "../services/project-members.service.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import { ProjectMemberIdParamSchema, ProjectMemberUserParamSchema, UpdateProjectMemberRoleSchema } from "../schemas/project-members.schema.js";

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

export const getCurrentUserProjectRoleController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const projectParam = ProjectIdParamSchema.safeParse(req.params);

        if (!projectParam.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const userRole : CurrentUserProjectRole = await getCurrentUserProjectRoleService(req.user, projectParam.data);

        res.status(200).json(userRole);
});

export const updateProjectMemberRoleController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectMemberIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const resultBody = UpdateProjectMemberRoleSchema.safeParse(req.body);

        if (!resultBody.success) {
            throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
        }

        const member : ProjectMemberFull = await updateProjectMemberRoleService(req.user, params.data, resultBody.data);

        res.status(200).json(member);
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
