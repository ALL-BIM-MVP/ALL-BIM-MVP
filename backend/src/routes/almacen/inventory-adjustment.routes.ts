import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    correctGoodsIssueController, correctGoodsReceiptController, getAdjustmentController, listAdjustmentsController,
    transferGoodsIssueController, transferGoodsReceiptController, voidGoodsIssueController, voidGoodsReceiptController,
} from '../../controllers/almacen/inventory-adjustment.controller.js';

// Ajustes de inventario (Fase 10). Corregir o anular exige `configure` (Administrador del módulo o
// dueño/administrador del proyecto); consultar, `view`. Un ajuste no se edita ni se da de baja:
// uno equivocado se corrige con otro ajuste.
export const inventoryAdjustmentRouter = Router();

inventoryAdjustmentRouter.post('/:projectId/goods-receipts/:goodsReceiptId/adjustments', requireAuth, correctGoodsReceiptController);
inventoryAdjustmentRouter.post('/:projectId/goods-receipts/:goodsReceiptId/void', requireAuth, voidGoodsReceiptController);
// Traspaso entre casillas (B11, 2026-09-26): envoltura sobre una corrección de 2 líneas — mismo permiso.
inventoryAdjustmentRouter.post('/:projectId/goods-receipts/:goodsReceiptId/transfer', requireAuth, transferGoodsReceiptController);
inventoryAdjustmentRouter.post('/:projectId/goods-issues/:goodsIssueId/adjustments', requireAuth, correctGoodsIssueController);
inventoryAdjustmentRouter.post('/:projectId/goods-issues/:goodsIssueId/void', requireAuth, voidGoodsIssueController);
inventoryAdjustmentRouter.post('/:projectId/goods-issues/:goodsIssueId/transfer', requireAuth, transferGoodsIssueController);
// GET / acepta ?goods_receipt_id=, ?goods_issue_id= y ?kind=correccion|anulacion.
inventoryAdjustmentRouter.get('/:projectId/inventory-adjustments', requireAuth, listAdjustmentsController);
inventoryAdjustmentRouter.get('/:projectId/inventory-adjustments/:adjustmentId', requireAuth, getAdjustmentController);
