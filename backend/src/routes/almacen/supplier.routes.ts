import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    createSupplierController, deleteSupplierController, getSupplierByIdController, listSuppliersController,
    updateSupplierController,
} from '../../controllers/almacen/supplier.controller.js';

export const supplierRouter = Router();

// GET / acepta ?search= (RUC o parte del nombre) para el autocompletado.
supplierRouter.get('/:projectId/suppliers', requireAuth, listSuppliersController);
supplierRouter.post('/:projectId/suppliers', requireAuth, createSupplierController);
supplierRouter.get('/:projectId/suppliers/:supplierId', requireAuth, getSupplierByIdController);
supplierRouter.put('/:projectId/suppliers/:supplierId', requireAuth, updateSupplierController);
supplierRouter.delete('/:projectId/suppliers/:supplierId', requireAuth, deleteSupplierController);
