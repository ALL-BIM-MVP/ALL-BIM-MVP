import type { Response, Request } from 'express';
import type { UserLayout, UserResponse } from "../models/users.models.js";
import { getAllUsersService, getMeService, registerService } from "../services/users.service.js";
import { GetUsersSchema } from "../schemas/users.schema.js";
import { asyncHandler } from '../utils/asyncHandler.js';
import { RegisterSchema } from '../schemas/auth.schema.js';
import type { AuthResponse } from '../models/auth.models.js';
import { COMMON_ERRORS } from '../models/errors/common.errors.js';
import { AUTH_ERRORS } from '../models/errors/auth.errors.js';
import { AppError } from '../models/errors/app-error.js';

export const registerController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
        throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
    }
    const data : AuthResponse = await registerService(result.data);
    console.log({message : "Usuaio creado correctamente", data})
    
    res.status(201).json(data);
});

export const getMeController = asyncHandler( async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }

    const userInfo : UserLayout = await getMeService(req.user.user_id);
    res.status(200).json(userInfo);
});


export const getAllUsersController = asyncHandler( async (req : Request, res : Response ) : Promise<void> => {
    const result = GetUsersSchema.safeParse(req.query);

    if (!result.success) {
        throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
    }

    const users : UserResponse[] = await getAllUsersService(result.data); 
    res.status(200).json(users);
});