import type { NextFunction, Request, Response } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import type { DecodedToken } from '../models/auth.models.js';
import { ERRORS } from '../models/error.models.js';


export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
    console.log("Ruta(requireAuth): ", req.route?.path);
    const header: string = req.headers.authorization || "";
    const token: string | null = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        const error = ERRORS.TOKEN_ACCESS_UNDEFINED;
        res.status(error.statusCode).json(error.response);
        return;
    }

    const decoded: DecodedToken | null = verifyAccessToken(token);

    if (!decoded) {
        const error = ERRORS.TOKEN_ACCESS_INVALID;
        res.status(error.statusCode).json(error.response);
        return;
    }

    const ahora = Math.floor(Date.now() / 1000);

    if (decoded.exp && decoded.exp < ahora) {
        const error = ERRORS.TOKEN_ACCESS_EXPIRED;
        res.status(error.statusCode).json(error.response);
        return;
    }

    req.user = decoded;
    next();
};

export const requireOwner = (req: Request, res: Response, next: NextFunction): void => {
    console.log("Ruta(requireOwner): ", req.route?.path);
    if (!req.user) {
        const error = ERRORS.AUTH_IDENTITY_UNKNOWN;
        res.status(error.statusCode).json(error.response);
        return;
    }
    
    const userIdParam = Number(req.params.id);

    if (Number.isNaN(userIdParam)) {
        const error = ERRORS.INVALID_ID_PARAM;
        res.status(error.statusCode).json(error.response);
        return;
    }

    const userIdAuth: number = req.user.user_id;

    if (userIdAuth !== userIdParam) {
        const error = ERRORS.FORBIDDEN_OWNER;
        res.status(error.statusCode).json(error.response);
        return;
    }
    
    next();
};

export const requireAdminPrivileges = (req: Request, res: Response, next: NextFunction): void => {
    console.log("Ruta(requireAdminPrivileges): ", req.route?.path);

    if (!req.user) {
        const error = ERRORS.AUTH_IDENTITY_UNKNOWN;
        res.status(error.statusCode).json(error.response);
        return;
    }

    const { role_id: roleId } = req.user;    

    if (roleId !== 1) {
        const error = ERRORS.FORBIDDEN_ADMIN;
        res.status(error.statusCode).json(error.response);
        return;
    }
    
    next();
};