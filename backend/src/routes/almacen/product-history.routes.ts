import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { getProductHistoryController } from '../../controllers/almacen/product-history.controller.js';

// Solo lectura. Hoja de vida del producto: ?bin_id= (historia de una casilla), ?from= y ?to= (AAAA-MM-DD).
export const productHistoryRouter = Router();

productHistoryRouter.get('/:projectId/products/:productId/history', requireAuth, getProductHistoryController);
