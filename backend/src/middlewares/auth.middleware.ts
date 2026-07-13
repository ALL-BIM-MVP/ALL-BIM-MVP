import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import type { DecodedToken } from '../models/auth.models.js';
import { AUTH_ERRORS } from '../models/errors/auth.errors.js';
import { COMMON_ERRORS } from '../models/errors/common.errors.js';
import { PERMISSION_ERRORS } from '../models/errors/permission.errors.js';
import { AppError } from '../models/errors/app-error.js';


export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    console.log("Ruta(requireAuth): ", req.route?.path);
    const header: string = req.headers.authorization || "";
    const token: string | null = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        throw new AppError(AUTH_ERRORS.ACCESS_TOKEN_MISSING);
    }

    const decoded: DecodedToken = verifyAccessToken(token);

    req.user = decoded;
    next();
};

export const requireOwner = (req: Request, res: Response, next: NextFunction): void => {
    console.log("Ruta(requireOwner): ", req.route?.path);
    
    if (!req.user) {
        throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    }
    
    const userIdParam = Number(req.params.id);

    if (Number.isNaN(userIdParam)) {
        throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
    }

    if (req.user.user_id !== userIdParam) {
        throw new AppError(PERMISSION_ERRORS.OWNER_PERMISSION_REQUIRED);
    }

    next();
};

export const requireRolePrivileges = (...allowedRolesIds: number[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        console.log("Ruta(requireAdminPrivileges): ", req.route?.path);

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const { role_id: roleId } = req.user;    

        if (!allowedRolesIds.includes(roleId)) {
            throw new AppError(PERMISSION_ERRORS.INSUFFICIENT_PERMISSIONS);
        }
            
        next();
    };
};
