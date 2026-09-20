import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    createGoodsReceiptController, getGoodsReceiptByIdController, linkGoodsReceiptPurchaseOrderController,
    listGoodsReceiptsController, setGoodsReceiptFileController, updateGoodsReceiptController,
} from '../../controllers/almacen/goods-receipt.controller.js';

// Sin DELETE — registro inmutable en lo físico (ver diseño 5): un error de cantidades,
// productos o casillas se corrige con un movimiento nuevo (Fase 10). El PATCH solo
// corrige datos administrativos de la guía, con auditoría.
export const goodsReceiptRouter = Router();

// GET / acepta ?supplier_id=, ?purchase_order_id=, ?entry_type= y ?search= (serie-número o proveedor).
goodsReceiptRouter.get('/:projectId/goods-receipts', requireAuth, listGoodsReceiptsController);
goodsReceiptRouter.post('/:projectId/goods-receipts', requireAuth, createGoodsReceiptController);
goodsReceiptRouter.get('/:projectId/goods-receipts/:goodsReceiptId', requireAuth, getGoodsReceiptByIdController);
goodsReceiptRouter.patch('/:projectId/goods-receipts/:goodsReceiptId', requireAuth, updateGoodsReceiptController);
// Vincula (o reemplaza) la orden de compra de un ingreso ya registrado, línea por línea.
goodsReceiptRouter.put('/:projectId/goods-receipts/:goodsReceiptId/purchase-order', requireAuth, linkGoodsReceiptPurchaseOrderController);
// Reemplazo completo del archivo (file_id o null para quitarlo).
goodsReceiptRouter.put('/:projectId/goods-receipts/:goodsReceiptId/file', requireAuth, setGoodsReceiptFileController);
