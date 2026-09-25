import { api } from '../api';
import {
  GoodsReceipt, GoodsReceiptCreateInput, GoodsReceiptEntryType, GoodsReceiptLinkOrderInput,
  GoodsReceiptListItem, GoodsReceiptPatchInput,
} from '../../types/almacen.types';

export const goodsReceiptService = {
  async getGoodsReceipts(projectId: number, filters: { supplierId?: number; purchaseOrderId?: string; entryType?: GoodsReceiptEntryType; search?: string } = {}): Promise<GoodsReceiptListItem[]> {
    const params = new URLSearchParams();
    if (filters.supplierId) params.set('supplier_id', String(filters.supplierId));
    if (filters.purchaseOrderId) params.set('purchase_order_id', filters.purchaseOrderId);
    if (filters.entryType) params.set('entry_type', filters.entryType);
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    const qs = params.toString();
    return api.get(`/api/projects/${projectId}/goods-receipts${qs ? `?${qs}` : ''}`);
  },

  // Trae items + reparto por bin + archivo — el listado no.
  async getGoodsReceiptById(projectId: number, goodsReceiptId: string): Promise<GoodsReceipt> {
    return api.get(`/api/projects/${projectId}/goods-receipts/${goodsReceiptId}`);
  },

  // Transacción única: cabecera + líneas + repartos + stock + Kardex de una. Sin DELETE — un
  // error de cantidades/casillas se corrige con un ajuste (Fase 10), nunca reescribiendo este.
  async createGoodsReceipt(projectId: number, data: GoodsReceiptCreateInput): Promise<GoodsReceipt> {
    return api.post(`/api/projects/${projectId}/goods-receipts`, data);
  },

  // Corrige SOLO datos administrativos de la guía (serie/número/fecha) — nunca cantidades, productos ni casillas.
  async patchGoodsReceipt(projectId: number, goodsReceiptId: string, data: GoodsReceiptPatchInput): Promise<GoodsReceipt> {
    return api.patch(`/api/projects/${projectId}/goods-receipts/${goodsReceiptId}`, data);
  },

  // Vincula o reemplaza la orden de compra de un ingreso ya registrado — no toca el stock. Una
  // entrada rápida pasa a normal.
  async linkPurchaseOrder(projectId: number, goodsReceiptId: string, data: GoodsReceiptLinkOrderInput): Promise<GoodsReceipt> {
    return api.put(`/api/projects/${projectId}/goods-receipts/${goodsReceiptId}/purchase-order`, data);
  },

  async setFile(projectId: number, goodsReceiptId: string, fileId: string | null): Promise<GoodsReceipt> {
    return api.put(`/api/projects/${projectId}/goods-receipts/${goodsReceiptId}/file`, { file_id: fileId });
  },
};
