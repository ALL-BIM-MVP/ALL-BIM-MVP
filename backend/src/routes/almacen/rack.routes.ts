import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    createRackController, deleteRackController, getRackByIdController, listRacksController, updateRackController,
} from '../../controllers/almacen/rack.controller.js';

export const rackRouter = Router();

rackRouter.get('/:projectId/warehouses/:warehouseId/racks', requireAuth, listRacksController);
rackRouter.post('/:projectId/warehouses/:warehouseId/racks', requireAuth, createRackController);
rackRouter.get('/:projectId/warehouses/:warehouseId/racks/:rackId', requireAuth, getRackByIdController);
rackRouter.put('/:projectId/warehouses/:warehouseId/racks/:rackId', requireAuth, updateRackController);
rackRouter.delete('/:projectId/warehouses/:warehouseId/racks/:rackId', requireAuth, deleteRackController);
