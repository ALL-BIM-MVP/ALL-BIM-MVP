import type { NextFunction, Request, Response} from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import type { DecodedToken } from '../models/auth.models.js';

export const requireAuth = (req : Request, res : Response, next : NextFunction ) : void  => {
    console.log("Ruta(requireAuth): ", req.route?.path);
    const header : string = req.headers.authorization || "";
    const token : string | null = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
        res.status(401).json({ message: "Token requerido, no recibido correctamente."});
        return;
    }

    const decoded : DecodedToken | null = verifyAccessToken(token);

    if (!decoded) {
        res.status(401).json({ message: "Token inválido, no pertenece a ALL-BIM." });
        return;
    }

    req.user = decoded;

    next();
};

export const requireOwner = (req : Request, res : Response, next : NextFunction) : void  => {
    console.log("Ruta(requireOwner): ", req.route?.path);
     if (!req.user) {
        res.status(401).json({ message: "Identidad no verificada o sin acceso." });
        return;
    }
    const userIdParam = Number(req.params.id);

    if (Number.isNaN(userIdParam)) {
        res.status(400).json({ message: "Parámetro 'id' inválido." });
        return;
    }

    const userIdAuth : number = req.user.user_id;

    if (userIdAuth !== userIdParam ) {
        res.status(403).json( { message: "Acceso Prohibido a los datos." });
        return;
    }
    
    next();
};

export const requireAdminPrivileges = (req : Request, res : Response, next : NextFunction) : void => {
    console.log("Ruta(requireAdminPrivileges): ", req.route?.path);

    if (!req.user) {
        res.status(401).json({ message: "Identidad con verificada o sin acceso." });
        return;
    }

    const { role_id : roleId } = req.user;    

    if (roleId !== 1 ) {
        res.status(403).json( { message: "Se requiere privilegios de administrador." });
        return;
    }
    
    next();
};  

