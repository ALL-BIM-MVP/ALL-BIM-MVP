import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { getTraceabilityController } from '../../controllers/almacen/traceability.controller.js';

// Solo lectura. documentType: requisition | quotation | purchase-order | invoice | goods-receipt.
// ?direction=backward|forward|all (por defecto all).
export const traceabilityRouter = Router();

traceabilityRouter.get('/:projectId/traceability/:documentType/:documentId', requireAuth, getTraceabilityController);
