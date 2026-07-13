import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { createProjectRoleService, deleteProjectRoleService, getListProjectRolesService, updateProjectRoleService } from "../services/project-roles.service.js";
import type { ProjectRoleFull } from "../models/project-roles.models.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { AppError } from "../models/errors/app-error.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { ProjectRoleCreateSchema, ProjectRoleIdParamSchema } from "../schemas/project-roles.schema.js";


export const getListProjectRoleController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }

    const ProjectRoles : ProjectRoleFull[] = await getListProjectRolesService(req.user);

    res.status(200).json(ProjectRoles);
});

export const createProjectRoleController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const result = ProjectRoleCreateSchema.safeParse(req.body);
    
    if (!result.success) {
        throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
    }
    
    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }

    const ProjectRole : ProjectRoleFull = await createProjectRoleService(req.user, result.data);

    res.status(201).json(ProjectRole);
});

export const updateProjectRoleController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const resultData = ProjectRoleCreateSchema.safeParse(req.body);
    
    if (!resultData.success) {
        throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
    }

    const resultIdProjectRole= ProjectRoleIdParamSchema.safeParse(req.params);
        
    if (!resultIdProjectRole.success) {
        throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
    }
    
    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }   
    console.log(resultData, resultIdProjectRole )
    const projectRole : ProjectRoleFull = await updateProjectRoleService(req.user, resultData.data, resultIdProjectRole.data);

    res.status(200).json(projectRole);
});

export const deleteProjectRoleByIdController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const result = ProjectRoleIdParamSchema.safeParse(req.params);
        
    if (!result.success) {
        throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
    }

    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }

    await deleteProjectRoleService(req.user, result.data);

    res.status(200).json({ message : "El rol de projecto ha sido eliminado con exito."});
});