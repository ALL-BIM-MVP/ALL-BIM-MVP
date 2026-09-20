import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    addInvoiceItemController, createInvoiceController, deleteInvoiceController, deleteInvoiceItemController,
    getInvoiceByIdController, listInvoicesController, setInvoiceFileController, updateInvoiceController,
    updateInvoiceItemController,
} from '../../controllers/almacen/invoice.controller.js';

export const invoiceRouter = Router();

const BASE = '/:projectId/invoices';

// GET / acepta ?supplier_id=, ?purchase_order_id= y ?search= (serie-número o proveedor).
invoiceRouter.get(BASE, requireAuth, listInvoicesController);
invoiceRouter.post(BASE, requireAuth, createInvoiceController);
invoiceRouter.get(`${BASE}/:invoiceId`, requireAuth, getInvoiceByIdController);
// Cabecera parcial: solo los campos enviados. Las líneas van aparte.
invoiceRouter.patch(`${BASE}/:invoiceId`, requireAuth, updateInvoiceController);
invoiceRouter.delete(`${BASE}/:invoiceId`, requireAuth, deleteInvoiceController);
// Reemplazo completo del archivo (file_id o null para quitarlo).
invoiceRouter.put(`${BASE}/:invoiceId/file`, requireAuth, setInvoiceFileController);
invoiceRouter.post(`${BASE}/:invoiceId/items`, requireAuth, addInvoiceItemController);
invoiceRouter.patch(`${BASE}/:invoiceId/items/:itemId`, requireAuth, updateInvoiceItemController);
invoiceRouter.delete(`${BASE}/:invoiceId/items/:itemId`, requireAuth, deleteInvoiceItemController);
