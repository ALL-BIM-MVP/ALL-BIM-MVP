import type{ Request, Response } from 'express';
import { getAllRolesService } from '../services/roles.service.js';
import type { Role } from '../models/roles.models.js';
import { AppError, ERRORS } from '../models/error.models.js';

export const getAllRolesController = async (req : Request, res : Response) : Promise<Response> => {

    try {
        const roles : Role[] = await getAllRolesService();
        return res.status(200).json(roles);
    } catch (error) {
        const serverError = ERRORS.INTERNAL_SERVER_ERROR;
        return res.status(serverError.statusCode).json(serverError.response);
    }
}