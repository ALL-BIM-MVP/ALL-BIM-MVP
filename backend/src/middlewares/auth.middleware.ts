import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import type { DecodedToken } from '../models/auth.models.js';
import { AppError, ERRORS } from '../models/error.models.js';


export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    console.log("Ruta(requireAuth): ", req.route?.path);
    const header: string = req.headers.authorization || "";
    const token: string | null = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        throw new AppError(ERRORS.TOKEN_ACCESS_UNDEFINED);
    }

    const decoded: DecodedToken = verifyAccessToken(token);

    req.user = decoded;
    next();
};

export const requireOwner = (req: Request, res: Response, next: NextFunction): void => {
    console.log("Ruta(requireOwner): ", req.route?.path);
    
    if (!req.user) {
        throw new AppError(ERRORS.AUTH_IDENTITY_UNKNOWN);
    }
    
    const userIdParam = Number(req.params.id);

    if (Number.isNaN(userIdParam)) {
        throw new AppError(ERRORS.INVALID_ID_PARAM);
    }

    if (req.user.user_id !== userIdParam) {
        throw new AppError(ERRORS.FORBIDDEN_OWNER);
    }

    next();
};

export const requireRolePrivileges = (...allowedRolesIds: number[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        console.log("Ruta(requireAdminPrivileges): ", req.route?.path);

        if (!req.user) {
            throw new AppError(ERRORS.AUTH_IDENTITY_UNKNOWN);
        }

        const { role_id: roleId } = req.user;    

        if (!allowedRolesIds.includes(roleId)) {
            throw new AppError(ERRORS.FORBIDDEN_ROLE);
        }
            
        next();
    };
};
