import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { getProductHistoryController } from '../../controllers/almacen/product-history.controller.js';

// Solo lectura. Hoja de vida del producto. Filtros: ?bin_id= (una casilla), ?from= y ?to= (AAAA-MM-DD),
// ?type=all|entrada|salida, ?sort=date|entrada_first|salida_first, ?direction=asc|desc, ?include_in_progress=true|false.
export const productHistoryRouter = Router();

productHistoryRouter.get('/:projectId/products/:productId/history', requireAuth, getProductHistoryController);
