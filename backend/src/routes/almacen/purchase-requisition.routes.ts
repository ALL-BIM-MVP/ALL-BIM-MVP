import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    addPurchaseRequisitionItemController, createPurchaseRequisitionController, deletePurchaseRequisitionController,
    deletePurchaseRequisitionItemController, getPurchaseRequisitionByIdController, listPurchaseRequisitionsController,
    setPurchaseRequisitionFileController, updatePurchaseRequisitionController, updatePurchaseRequisitionItemController,
} from '../../controllers/almacen/purchase-requisition.controller.js';

export const purchaseRequisitionRouter = Router();

const BASE = '/:projectId/purchase-requisitions';

// GET / acepta ?search= (número o solicitante).
purchaseRequisitionRouter.get(BASE, requireAuth, listPurchaseRequisitionsController);
purchaseRequisitionRouter.post(BASE, requireAuth, createPurchaseRequisitionController);
purchaseRequisitionRouter.get(`${BASE}/:purchaseRequisitionId`, requireAuth, getPurchaseRequisitionByIdController);
// Cabecera parcial: solo los campos enviados. Las líneas van aparte.
purchaseRequisitionRouter.patch(`${BASE}/:purchaseRequisitionId`, requireAuth, updatePurchaseRequisitionController);
purchaseRequisitionRouter.delete(`${BASE}/:purchaseRequisitionId`, requireAuth, deletePurchaseRequisitionController);
// Reemplazo completo del archivo (file_id o null para quitarlo).
purchaseRequisitionRouter.put(`${BASE}/:purchaseRequisitionId/file`, requireAuth, setPurchaseRequisitionFileController);
purchaseRequisitionRouter.post(`${BASE}/:purchaseRequisitionId/items`, requireAuth, addPurchaseRequisitionItemController);
purchaseRequisitionRouter.patch(`${BASE}/:purchaseRequisitionId/items/:itemId`, requireAuth, updatePurchaseRequisitionItemController);
purchaseRequisitionRouter.delete(`${BASE}/:purchaseRequisitionId/items/:itemId`, requireAuth, deletePurchaseRequisitionItemController);
