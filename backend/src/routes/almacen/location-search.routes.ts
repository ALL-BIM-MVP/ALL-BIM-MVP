import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { searchLocationController } from '../../controllers/almacen/location-search.controller.js';

export const locationSearchRouter = Router();

locationSearchRouter.get('/:projectId/locations/search', requireAuth, searchLocationController);
