import { api } from '../api';
import {
  GoodsIssueAdjustmentInput, GoodsReceiptAdjustmentInput, InventoryAdjustment, InventoryAdjustmentKind, VoidDocumentInput,
} from '../../types/almacen.types';

// Un ingreso/vale registrado NO se edita ni se borra — un error de cantidades o casillas se
// corrige con un ajuste, sin reescribir el original. Solo "configure" corrige/anula (403 si no).
export const inventoryAdjustmentService = {
  async createGoodsReceiptAdjustment(projectId: number, goodsReceiptId: string, data: GoodsReceiptAdjustmentInput): Promise<InventoryAdjustment> {
    return api.post(`/api/projects/${projectId}/goods-receipts/${goodsReceiptId}/adjustments`, data);
  },

  async voidGoodsReceipt(projectId: number, goodsReceiptId: string, data: VoidDocumentInput): Promise<InventoryAdjustment> {
    return api.post(`/api/projects/${projectId}/goods-receipts/${goodsReceiptId}/void`, data);
  },

  async createGoodsIssueAdjustment(projectId: number, goodsIssueId: number, data: GoodsIssueAdjustmentInput): Promise<InventoryAdjustment> {
    return api.post(`/api/projects/${projectId}/goods-issues/${goodsIssueId}/adjustments`, data);
  },

  async voidGoodsIssue(projectId: number, goodsIssueId: number, data: VoidDocumentInput): Promise<InventoryAdjustment> {
    return api.post(`/api/projects/${projectId}/goods-issues/${goodsIssueId}/void`, data);
  },

  async getAdjustments(projectId: number, filters: { goodsReceiptId?: string; goodsIssueId?: number; kind?: InventoryAdjustmentKind } = {}): Promise<InventoryAdjustment[]> {
    const params = new URLSearchParams();
    if (filters.goodsReceiptId) params.set('goods_receipt_id', filters.goodsReceiptId);
    if (filters.goodsIssueId) params.set('goods_issue_id', String(filters.goodsIssueId));
    if (filters.kind) params.set('kind', filters.kind);
    const qs = params.toString();
    return api.get(`/api/projects/${projectId}/inventory-adjustments${qs ? `?${qs}` : ''}`);
  },

  async getAdjustmentById(projectId: number, id: string): Promise<InventoryAdjustment> {
    return api.get(`/api/projects/${projectId}/inventory-adjustments/${id}`);
  },
};
