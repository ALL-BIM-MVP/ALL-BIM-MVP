import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    addQuotationItemController, createQuotationController, deleteQuotationController, deleteQuotationItemController,
    getQuotationByIdController, listQuotationsController, setQuotationFileController, updateQuotationController,
    updateQuotationItemController,
} from '../../controllers/almacen/quotation.controller.js';

export const quotationRouter = Router();

const BASE = '/:projectId/quotations';

// GET / acepta ?purchase_requisition_id=, ?supplier_id= y ?search= (número o proveedor).
quotationRouter.get(BASE, requireAuth, listQuotationsController);
quotationRouter.post(BASE, requireAuth, createQuotationController);
quotationRouter.get(`${BASE}/:quotationId`, requireAuth, getQuotationByIdController);
// Cabecera parcial: solo los campos enviados. Las líneas van aparte.
quotationRouter.patch(`${BASE}/:quotationId`, requireAuth, updateQuotationController);
quotationRouter.delete(`${BASE}/:quotationId`, requireAuth, deleteQuotationController);
// Reemplazo completo del archivo (file_id o null para quitarlo).
quotationRouter.put(`${BASE}/:quotationId/file`, requireAuth, setQuotationFileController);
quotationRouter.post(`${BASE}/:quotationId/items`, requireAuth, addQuotationItemController);
quotationRouter.patch(`${BASE}/:quotationId/items/:itemId`, requireAuth, updateQuotationItemController);
quotationRouter.delete(`${BASE}/:quotationId/items/:itemId`, requireAuth, deleteQuotationItemController);
