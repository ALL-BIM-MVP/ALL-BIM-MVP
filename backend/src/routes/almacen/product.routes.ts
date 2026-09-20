import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    assignProductModel3DController, createProductController, deleteProductController, getProductByIdController,
    listProductsController, updateProductController,
} from '../../controllers/almacen/product.controller.js';

export const productRouter = Router();

productRouter.get('/:projectId/products', requireAuth, listProductsController);
productRouter.post('/:projectId/products', requireAuth, createProductController);
productRouter.get('/:projectId/products/:productId', requireAuth, getProductByIdController);
productRouter.put('/:projectId/products/:productId', requireAuth, updateProductController);
productRouter.delete('/:projectId/products/:productId', requireAuth, deleteProductController);

// Asigna/saca un modelo YA existente del catálogo (mío, del sistema, o
// ya en uso en este proyecto) — JSON puro. Subir un archivo NUEVO es
// otro endpoint aparte, sin proyecto (ver routes/almacen/model-3d-asset.routes.ts,
// POST /api/model-3d-assets) — separados a propósito, ver
// docs/roadmap/almacen-bim.md.
productRouter.put('/:projectId/products/:productId/model-3d', requireAuth, assignProductModel3DController);
