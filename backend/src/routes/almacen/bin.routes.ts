import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { updateBinController } from '../../controllers/almacen/bin.controller.js';

// Única mutación de bin en esta fase — se generan solas con su rack
// (ver rack.routes.ts, POST .../racks).
export const binRouter = Router();

binRouter.patch(
    '/:projectId/warehouses/:warehouseId/racks/:rackId/bins/:binId', requireAuth, updateBinController
);
