import type { Response, Request } from 'express';
import type { ProfilePictureInfo, UserLayout, UserResponse } from "../models/users.models.js";
import {
    deleteProfilePictureService, deleteSelfService, deleteUserByAdminService,
    getAllUsersService, getMeService, registerService, setUserActiveService,
    updateMeService, uploadProfilePictureService,
} from "../services/users.service.js";
import { GetUsersSchema, SetUserActiveSchema, UpdateMeSchema, UserIdParamSchema } from "../schemas/users.schema.js";
import { asyncHandler } from '../utils/asyncHandler.js';
import { RegisterSchema } from '../schemas/auth.schema.js';
import type { AuthResponse } from '../models/auth.models.js';
import { COMMON_ERRORS } from '../models/errors/common.errors.js';
import { AUTH_ERRORS } from '../models/errors/auth.errors.js';
import { USER_ERRORS } from '../models/errors/user.errors.js';
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

// ------------------------------------------------------------
// FASE 1 — perfil de usuario (autogestión + administración)
// ------------------------------------------------------------

export const updateMeController = asyncHandler( async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const body = UpdateMeSchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    const userInfo : UserLayout = await updateMeService(req.user.user_id, body.data);
    res.status(200).json(userInfo);
});

export const uploadProfilePictureController = asyncHandler( async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    if (!req.file) throw new AppError(USER_ERRORS.INVALID_IMAGE_FILE);

    const info : ProfilePictureInfo = await uploadProfilePictureService(req.user.user_id, req.file.buffer);
    res.status(200).json(info);
});

export const deleteProfilePictureController = asyncHandler( async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const info : ProfilePictureInfo = await deleteProfilePictureService(req.user.user_id);
    res.status(200).json(info);
});

export const deleteSelfController = asyncHandler( async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    await deleteSelfService(req.user.user_id);
    res.status(200).json({ message: "Cuenta eliminada correctamente." });
});

export const setUserActiveController = asyncHandler( async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = UserIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const body = SetUserActiveSchema.safeParse(req.body);
    if (!body.success) throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);

    const updated : UserResponse = await setUserActiveService(req.user, params.data, body.data);
    res.status(200).json(updated);
});

export const deleteUserByAdminController = asyncHandler( async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = UserIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    await deleteUserByAdminService(req.user, params.data);
    res.status(200).json({ message: "Cuenta eliminada correctamente." });
});
