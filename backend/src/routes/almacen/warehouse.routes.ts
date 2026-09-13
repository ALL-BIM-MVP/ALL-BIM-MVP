import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    createWarehouseController, deleteWarehouseController, getWarehouseByIdController, listWarehousesController,
    updateWarehouseController,
} from '../../controllers/almacen/warehouse.controller.js';

// Cuelga de /api/projects (ver routes/almacen/index.ts e index.ts) — el
// permiso real de cada operación (view/process/delete del módulo
// `almacen`) se resuelve adentro del service, no acá.
export const warehouseRouter = Router();

warehouseRouter.get('/:projectId/warehouses', requireAuth, listWarehousesController);
warehouseRouter.post('/:projectId/warehouses', requireAuth, createWarehouseController);
warehouseRouter.get('/:projectId/warehouses/:warehouseId', requireAuth, getWarehouseByIdController);
warehouseRouter.put('/:projectId/warehouses/:warehouseId', requireAuth, updateWarehouseController);
warehouseRouter.delete('/:projectId/warehouses/:warehouseId', requireAuth, deleteWarehouseController);
