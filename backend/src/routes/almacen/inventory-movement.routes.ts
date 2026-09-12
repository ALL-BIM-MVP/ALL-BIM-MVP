import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { listInventoryMovementsController } from '../../controllers/almacen/inventory-movement.controller.js';

export const inventoryMovementRouter = Router();

inventoryMovementRouter.get('/:projectId/inventory-movements', requireAuth, listInventoryMovementsController);
