import type { Request, Response} from 'express';
import type { AuthResponse, InvitationResponse, Tokens, ValidateResponse } from '../models/auth.models.js';
import { loginService, logoutService, refreshSessionService } from '../services/auth.service.js';
import { InvitationSchema, LoginSchema, TokenSchema } from '../schemas/auth.schema.js';
import { AppError, ERRORS } from '../models/error.models.js';
import type { UserLayout } from '../models/users.models.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const loginController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const result = LoginSchema.safeParse(req.body);
    
    if (!result.success) {
        throw new AppError(ERRORS.AUTH_BAD_REQUEST);
    }
    
    const data : AuthResponse = await loginService(result.data);

    res.status(200).json(data);

});

export const refreshSessionController = asyncHandler( async (req: Request, res: Response): Promise<void> => {
    const { refresh_token } = req.body;
    if (!refresh_token) {
        throw new AppError(ERRORS.TOKEN_REFRESH_UNDEFINED);
    }

    const tokens : Tokens = await refreshSessionService(refresh_token);
        
    res.status(200).json(tokens);
});

export const logoutController = asyncHandler( async (req: Request, res: Response): Promise<void> => {
    const { refresh_token } = req.body;
    if (!refresh_token) {
        throw new AppError(ERRORS.TOKEN_REFRESH_UNDEFINED);
    }
        
    await logoutService(refresh_token);
        
    res.status(200).json({ message: "Sesión cerrada correctamente." });
});

