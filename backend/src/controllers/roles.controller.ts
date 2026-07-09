import type{ Request, Response } from 'express';
import { getAllRolesService } from '../services/roles.service.js';
import type { Role } from '../models/roles.models.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getRolesController = asyncHandler( async (req : Request, res : Response) : Promise<void> => {
    const roles : Role[] = await getAllRolesService();
    res.status(200).json(roles);
});