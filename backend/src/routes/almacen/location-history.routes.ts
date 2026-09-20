import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { getBinHistoryController, getRackHistoryController } from '../../controllers/almacen/location-history.controller.js';

// Solo lectura. Hoja de vida de una ubicación (estante o casilla). Filtros: ?product_id=, ?from=, ?to=
// (AAAA-MM-DD), ?type=all|entrada|salida, ?sort=date|entrada_first|salida_first, ?direction=asc|desc.
export const locationHistoryRouter = Router();

locationHistoryRouter.get('/:projectId/warehouses/:warehouseId/racks/:rackId/history', requireAuth, getRackHistoryController);
locationHistoryRouter.get('/:projectId/warehouses/:warehouseId/racks/:rackId/bins/:binId/history', requireAuth, getBinHistoryController);
