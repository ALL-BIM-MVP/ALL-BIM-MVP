import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    correctGoodsIssueController, correctGoodsReceiptController, getAdjustmentController, listAdjustmentsController,
    voidGoodsIssueController, voidGoodsReceiptController,
} from '../../controllers/almacen/inventory-adjustment.controller.js';

// Ajustes de inventario (Fase 10). Corregir o anular exige `configure` (Administrador del módulo o
// dueño/administrador del proyecto); consultar, `view`. Un ajuste no se edita ni se da de baja:
// uno equivocado se corrige con otro ajuste.
export const inventoryAdjustmentRouter = Router();

inventoryAdjustmentRouter.post('/:projectId/goods-receipts/:goodsReceiptId/adjustments', requireAuth, correctGoodsReceiptController);
inventoryAdjustmentRouter.post('/:projectId/goods-receipts/:goodsReceiptId/void', requireAuth, voidGoodsReceiptController);
inventoryAdjustmentRouter.post('/:projectId/goods-issues/:goodsIssueId/adjustments', requireAuth, correctGoodsIssueController);
inventoryAdjustmentRouter.post('/:projectId/goods-issues/:goodsIssueId/void', requireAuth, voidGoodsIssueController);
// GET / acepta ?goods_receipt_id=, ?goods_issue_id= y ?kind=correccion|anulacion.
inventoryAdjustmentRouter.get('/:projectId/inventory-adjustments', requireAuth, listAdjustmentsController);
inventoryAdjustmentRouter.get('/:projectId/inventory-adjustments/:adjustmentId', requireAuth, getAdjustmentController);
