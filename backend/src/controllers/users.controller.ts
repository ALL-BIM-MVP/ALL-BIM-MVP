import type { Response, Request } from 'express';
import type { UserResponse } from "../models/users.models.js";
import { getAllUsersService } from "../services/users.service.js";
import { GetUsersSchema } from "../schemas/users.schema.js";
import { AppError, ERRORS } from '../models/error.models.js';

export const getAllUsersController = async (req : Request, res : Response ) : Promise<Response> => {

    const result = GetUsersSchema.safeParse(req.query);

    if (!result.success) {
        const error = ERRORS.USERS_BAD_REQUEST;
        return res.status(error.statusCode).json(error.response);
    }

    try {
        const users : UserResponse[] = await getAllUsersService(result.data); 
        return res.status(200).json(users);
    } catch (error) {
        const serverError = ERRORS.INTERNAL_SERVER_ERROR;
        return res.status(serverError.statusCode).json(serverError.response);
    }
} 