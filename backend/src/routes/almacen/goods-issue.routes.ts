import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    createGoodsIssueController, getGoodsIssueByIdController, listGoodsIssuesController,
} from '../../controllers/almacen/goods-issue.controller.js';

// Sin PUT/DELETE — registro de movimiento inmutable (ver diseño 5).
export const goodsIssueRouter = Router();

goodsIssueRouter.get('/:projectId/goods-issues', requireAuth, listGoodsIssuesController);
goodsIssueRouter.post('/:projectId/goods-issues', requireAuth, createGoodsIssueController);
goodsIssueRouter.get('/:projectId/goods-issues/:goodsIssueId', requireAuth, getGoodsIssueByIdController);
