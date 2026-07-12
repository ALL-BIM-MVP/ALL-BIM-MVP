import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../models/error.models.js";
import { GetProjectsSchema, ProjectCreateSchema, ProjectIdParamSchema, ProjectUpdateSchema } from "../schemas/projects.schema.js";
import type { ProjectFull } from "../models/projects.models.js";
import { createProjectService, deleteProjectByIdService, getListProjectService, getProjectByIdService, updateProjectService } from "../services/projects.service.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";


export const getListProjectsController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const result = GetProjectsSchema.safeParse(req.query);
    if (!result.success) {
        throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
    }
    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }

    const Projects : ProjectFull[] = await getListProjectService(req.user, result.data);

    res.status(200).json(Projects);
});

export const getProjectByIdController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const result = ProjectIdParamSchema.safeParse(req.params);
    
    if (!result.success) {
        throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
    }

    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }

    const Projects  = await getProjectByIdService(req.user, result.data);

    res.status(200).json(Projects);
});

export const createProjectController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const result = ProjectCreateSchema.safeParse(req.body);

    if (!result.success) {
        throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
    }

    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }

    const Projects  = await createProjectService(req.user, result.data);

    res.status(200).json(Projects);
});

export const updateProjectController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    
    console.log(req.body)
    const resultData = ProjectUpdateSchema.safeParse(req.body);
    console.log(resultData.data)
    if (!resultData.success) {
        throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
    }

    const resultIdProject= ProjectIdParamSchema.safeParse(req.params);
    
    if (!resultIdProject.success) {
        throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
    }
    
    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }

    const Projects  = await updateProjectService(req.user, resultIdProject.data, resultData.data);

    res.status(200).json(Projects);

});

export const deleteProjectByIdController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {

    const result = ProjectIdParamSchema.safeParse(req.params);
    
    if (!result.success) {
        throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
    }
    
    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }

    await deleteProjectByIdService(req.user, result.data );

    res.status(200).json({ message : "El projecto ha sido eliminado con exito."});
});