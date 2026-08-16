import type { Request, Response} from 'express';
import { GetUserInvitationsQuerySchema, InvitationSchema, TokenSchema } from "../schemas/auth.schema.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import type { InvitationResponse, ValidateResponse } from '../models/auth.models.js';
import type { UserInvitationHistoryItem } from '../models/user-invitations.models.js';
import { createInvitationService, getUserInvitationsHistoryService, validateInvitationService } from '../services/user-invitations.service.js';
import { COMMON_ERRORS } from '../models/errors/common.errors.js';
import { AppError } from '../models/errors/app-error.js';
import { AUTH_ERRORS } from '../models/errors/auth.errors.js';


export const createInvitationController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const result = InvitationSchema.safeParse(req.body);
    
    if (!result.success) {
        throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
    }
 
    const data : InvitationResponse = await createInvitationService(result.data);
    console.log({ message: `Invitacion enviada Correctamente a: ${result.data.email}` })
    res.status(201).json(data);

});

export const validateInvitationController = asyncHandler( async (req : Request, res : Response) : Promise<void>=>  {
    const result = TokenSchema.safeParse(req.query);
    if (!result.success) {
        throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
    }

    const { token } = result.data;
    const validateData : ValidateResponse = await validateInvitationService(token);

    res.status(200).json(validateData);
});

export const getUserInvitationsHistoryController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }

    const query = GetUserInvitationsQuerySchema.safeParse(req.query);
    if (!query.success) {
        throw new AppError(COMMON_ERRORS.INVALID_QUERY_PARAMETER);
    }

    const history : UserInvitationHistoryItem[] = await getUserInvitationsHistoryService(query.data);

    res.status(200).json(history);
});