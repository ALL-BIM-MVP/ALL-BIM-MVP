import type { Request, Response} from 'express';
import type { Tokens, ValidateResponse } from '../models/auth.models.js';
import { invitationService, loginService, registerService, validateInvitationTokenService } from '../services/auth.service.js';
import { InvitationSchema, LoginSchema, RegisterSchema, TokenSchema } from '../schemas/auth.schema.js';
import { AppError, ERRORS } from '../models/error.models.js';

export const loginController = async (req : Request, res : Response) : Promise<Response> => {
    const result = LoginSchema.safeParse(req.body);
    
    if (!result.success) {
        const error = ERRORS.AUTH_BAD_REQUEST;
        return res.status(error.statusCode).json(error.response);
    }

    try {
        const tokens : Tokens | null = await loginService(result.data);
        
        if (!tokens) {
            const error = ERRORS.LOGIN_FAILED;
            return res.status(error.statusCode).json(error.response);
        }

        return res.status(200).json(tokens);
    } catch (error) {
        const serverError = ERRORS.INTERNAL_SERVER_ERROR;
        return res.status(serverError.statusCode).json(serverError.response);
    }
};

export const invitationController = async (req : Request, res : Response) : Promise<Response> => {

    const result = InvitationSchema.safeParse(req.body);
    
    if (!result.success) {
        const error = ERRORS.AUTH_BAD_REQUEST;
        return res.status(error.statusCode).json(error.response);
    }

    try {  
        await invitationService(result.data);

        return res.status(200).json({ message: `Invitacion enviada Correctamente a: ${result.data.email}` });
    } catch (error) {
    
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.response);
        }
        const serverError = ERRORS.INTERNAL_SERVER_ERROR;
        return res.status(serverError.statusCode).json(serverError.response);
    }
};

export const validateInvitationController = async (req : Request, res : Response) : Promise<Response>=>  {

    const result = TokenSchema.safeParse(req.query);
    if (!result.success) {
        const error = ERRORS.AUTH_BAD_REQUEST;
        return res.status(error.statusCode).json(error.response);
    }

    const { token } = result.data;

    try {
        const validateData : ValidateResponse = await validateInvitationTokenService(token);
    
        return res.status(200).json(validateData);
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.response);
        }
        const serverError = ERRORS.INTERNAL_SERVER_ERROR;
        return res.status(serverError.statusCode).json(serverError.response);
    }
}

export const registerController = async (req : Request, res : Response) : Promise<Response> => {
    
    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
        const error = ERRORS.AUTH_BAD_REQUEST;
        return res.status(error.statusCode).json(error.response);
    }
    
    try {
        await registerService(result.data);
        return res.status(200).json({ message: "Usuario creado correctamente."});
    } catch (error) {
        if (error instanceof AppError) {
            return res.status(error.statusCode).json(error.response);
        }
        const serverError = ERRORS.INTERNAL_SERVER_ERROR;
        return res.status(serverError.statusCode).json(serverError.response);
    }
}