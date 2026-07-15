import type { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../models/errors/app-error.js";
import type { ProjectInvitationForUser, ProjectInvitationFull } from "../models/project-invitations.models.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { createInvitationToProjectService, getListInvitationsOfProjectService, getMeInvitationsToProjectsService, getUsersSuggestionForInvitationToProjectService, updateStatusInvitationService } from "../services/project-invitations.service.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import { DataForInvitationSchema, MeInvitationsQuerySchema, ProjectInvitationsParamsSchema, SearchUsersQuerySchema, updateStatusSchema } from "../schemas/project-invitations.schema.js";

export const getListInvitationsOfProjectController = asyncHandler ( 
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const projectParam = ProjectIdParamSchema.safeParse(req.params);
            
        if (!projectParam.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }
            
        const invitationsOfProject : ProjectInvitationFull[] = await getListInvitationsOfProjectService(req.user, projectParam.data);
        
        res.status(200).json(invitationsOfProject);
}); 

export const createInvitationToProjectController = asyncHandler ( 
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const projectParam = ProjectIdParamSchema.safeParse(req.params);
            
        if (!projectParam.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const resultBody = DataForInvitationSchema.safeParse(req.body);
            
        if (!resultBody.success) {
            throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
        }
        const invitation : ProjectInvitationFull = await createInvitationToProjectService(req.user, projectParam.data, resultBody.data);
        
        res.status(201).json(invitation);
}); 

export const updateStatusInvitationController = asyncHandler ( 
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectInvitationsParamsSchema.safeParse(req.params);
            
        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const resultBody = updateStatusSchema.safeParse(req.body);
            
        if (!resultBody.success) {
            throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
        }
        const invitation : ProjectInvitationFull = await updateStatusInvitationService(req.user, params.data, resultBody.data);
        
        res.status(200).json(invitation);
}); 


export const getMeInvitationsToProjectsController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> => {
        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }
        
        const filter = MeInvitationsQuerySchema.safeParse(req.query);   
        if (!filter.success) {
            throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);
        }

        const invitations : ProjectInvitationForUser [] = await getMeInvitationsToProjectsService(req.user, filter.data);
        
        res.status(200).json(invitations);
});


export const getUsersSuggestionForInvitationToProjectController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> => {
        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const projectParam = ProjectIdParamSchema.safeParse(req.params);
        if (!projectParam.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const queryBody = SearchUsersQuerySchema.safeParse(req.query);
        if (!queryBody.success) {
            throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);
        }

        const suggestions = await getUsersSuggestionForInvitationToProjectService(queryBody.data,projectParam.data);
        
        res.status(200).json(suggestions);
});