import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    addPurchaseOrderItemController, createPurchaseOrderController, deletePurchaseOrderController,
    deletePurchaseOrderItemController, getPurchaseOrderByIdController, listPurchaseOrdersController,
    setPurchaseOrderFileController, updatePurchaseOrderController, updatePurchaseOrderItemController,
} from '../../controllers/almacen/purchase-order.controller.js';

export const purchaseOrderRouter = Router();

const BASE = '/:projectId/purchase-orders';

// GET / acepta ?supplier_id=, ?purchase_requisition_id=, ?quotation_id= y ?search= (número o proveedor).
purchaseOrderRouter.get(BASE, requireAuth, listPurchaseOrdersController);
purchaseOrderRouter.post(BASE, requireAuth, createPurchaseOrderController);
purchaseOrderRouter.get(`${BASE}/:purchaseOrderId`, requireAuth, getPurchaseOrderByIdController);
// Cabecera parcial: solo los campos enviados. Las líneas van aparte.
purchaseOrderRouter.patch(`${BASE}/:purchaseOrderId`, requireAuth, updatePurchaseOrderController);
purchaseOrderRouter.delete(`${BASE}/:purchaseOrderId`, requireAuth, deletePurchaseOrderController);
// Reemplazo completo del archivo (file_id o null para quitarlo).
purchaseOrderRouter.put(`${BASE}/:purchaseOrderId/file`, requireAuth, setPurchaseOrderFileController);
purchaseOrderRouter.post(`${BASE}/:purchaseOrderId/items`, requireAuth, addPurchaseOrderItemController);
purchaseOrderRouter.patch(`${BASE}/:purchaseOrderId/items/:itemId`, requireAuth, updatePurchaseOrderItemController);
purchaseOrderRouter.delete(`${BASE}/:purchaseOrderId/items/:itemId`, requireAuth, deletePurchaseOrderItemController);
