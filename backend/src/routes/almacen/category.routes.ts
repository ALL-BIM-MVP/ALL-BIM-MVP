import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { listCategoriesController } from '../../controllers/almacen/category.controller.js';

export const categoryRouter = Router();

categoryRouter.get('/:projectId/categories', requireAuth, listCategoriesController);
