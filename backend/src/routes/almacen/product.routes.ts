import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    createProductController, deleteProductController, getProductByIdController, listProductsController,
    updateProductController,
} from '../../controllers/almacen/product.controller.js';

export const productRouter = Router();

productRouter.get('/:projectId/products', requireAuth, listProductsController);
productRouter.post('/:projectId/products', requireAuth, createProductController);
productRouter.get('/:projectId/products/:productId', requireAuth, getProductByIdController);
productRouter.put('/:projectId/products/:productId', requireAuth, updateProductController);
productRouter.delete('/:projectId/products/:productId', requireAuth, deleteProductController);
