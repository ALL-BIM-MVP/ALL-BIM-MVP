import type { Request, Response} from 'express';
import { InvitationSchema, TokenSchema } from "../schemas/auth.schema.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import type { InvitationResponse, ValidateResponse } from '../models/auth.models.js';
import { createInvitationService, validateInvitationService } from '../services/user-invitations.service.js';
import { COMMON_ERRORS } from '../models/errors/common.errors.js';
import { AppError } from '../models/errors/app-error.js';


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