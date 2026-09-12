import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    createGoodsReceiptController, getGoodsReceiptByIdController, listGoodsReceiptsController,
} from '../../controllers/almacen/goods-receipt.controller.js';

// Sin PUT/DELETE — registro de movimiento inmutable (ver diseño 5).
export const goodsReceiptRouter = Router();

goodsReceiptRouter.get('/:projectId/goods-receipts', requireAuth, listGoodsReceiptsController);
goodsReceiptRouter.post('/:projectId/goods-receipts', requireAuth, createGoodsReceiptController);
goodsReceiptRouter.get('/:projectId/goods-receipts/:goodsReceiptId', requireAuth, getGoodsReceiptByIdController);
