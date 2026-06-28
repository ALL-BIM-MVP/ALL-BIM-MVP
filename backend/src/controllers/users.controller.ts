import type { Response, Request } from 'express';
import type { UserResponse } from "../models/users.models.js";
import { getAllUsersService } from "../services/users.service.js";
import { GetUsersSchema } from "../schemas/users.schema.js";

export const getAllUsersController = async (req : Request, res : Response ) : Promise<Response> => {

    const result = GetUsersSchema.safeParse(req.query);

    if (!result.success) {
        return res.status(400).json({ message : "Los recursos de consulta invalidos." });
    }

    try {
        const users : UserResponse[] = await getAllUsersService(result.data); 
        return res.status(200).json(users);
    } catch (error) {
        return res.status(500).json({ message: "Problema interno del servidor."});
    }
} 