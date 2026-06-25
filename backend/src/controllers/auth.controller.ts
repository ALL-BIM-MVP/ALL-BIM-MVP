import type { Request, Response} from 'express';
import type { LoginData, Tokens } from '../models/auth.models.js';
import { loginService } from '../services/auth.service.js';

export const loginController = async (req : Request, res : Response) : Promise<Response> => {
    const loginData : LoginData = req.body;
    console.log(loginData);
    try {
        const tokens : Tokens | null = await loginService(loginData);

        if (!tokens) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        return res.status(200).json(tokens);
    } catch (error) {
        return res.status(500).json({ message: 'Problema interno del servidor.' });
    }
};
