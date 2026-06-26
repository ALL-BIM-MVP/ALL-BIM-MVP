import type { Request, Response} from 'express';
import type { Tokens, ValidateResponse } from '../models/auth.models.js';
import { invitationService, loginService, validateInvitationTokenService } from '../services/auth.service.js';
import { InvitationSchema, LoginSchema, TokenSchema } from '../schemas/auth.schema.js';
import { AppError } from '../models/error.models.js';
import { Result } from 'pg';

export const loginController = async (req : Request, res : Response) : Promise<Response> => {
    const result = LoginSchema.safeParse(req.body);
    
    if (!result.success) {
        return res.status(400).json({ message: "Credenciales invalidas"});
    }

    try {
        const tokens : Tokens | null = await loginService(result.data);
        console.log(tokens)
        if (!tokens) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        return res.status(200).json(tokens);
    } catch (error) {
        return res.status(500).json({ message: 'Problema interno del servidor.' });
    }
};

export const invitationController = async (req : Request, res : Response) : Promise<Response> => {

    const result = InvitationSchema.safeParse(req.body);
    
    if (!result.success) {
        return res.status(400).json({ message: "Datos de la invitacion invalidos."});
    }

    try {  
        await invitationService(result.data);

        return res.status(200).json({ message: `Invitacion enviada Correctamente a: ${result.data.email}` });
    } catch (error) {
    
        if (error instanceof AppError ) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Problema interno del servidor.' });
    }
};

export const validateInvitationController = async (req : Request, res : Response) : Promise<Response>=>  {

    const result = TokenSchema.safeParse(req.query);
    if (!result.success) {
        return res.status(400).json({ message: "El recurso 'token' invalido."});
    }

    const { token } = result.data;

    try {
        const validateData : ValidateResponse = await validateInvitationTokenService(token);
    
        return res.status(200).json(validateData);
    } catch (error) {
        if (error instanceof AppError ) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Problema interno del servidor.' });
    }
}

export const registerController = () => {

}