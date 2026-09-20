import { api } from '../api';
import { GoodsReceipt, GoodsReceiptInput } from '../../types/almacen.types';

// Mismo problema de siempre: total_quantity/quantity son NUMERIC Y todos los
// *_id de acá son BIGINT — los dos tipos vuelven como string desde Postgres.
function normalizeGoodsReceipt(g: any): GoodsReceipt {
  return {
    ...g,
    goods_receipt_id: Number(g.goods_receipt_id),
    items: g.items?.map((it: any) => ({
      ...it,
      goods_receipt_item_id: Number(it.goods_receipt_item_id),
      goods_receipt_id: Number(it.goods_receipt_id),
      product_id: Number(it.product_id),
      total_quantity: Number(it.total_quantity),
      locations: it.locations?.map((l: any) => ({
        ...l,
        goods_receipt_item_location_id: Number(l.goods_receipt_item_location_id),
        goods_receipt_item_id: Number(l.goods_receipt_item_id),
        bin_id: Number(l.bin_id),
        quantity: Number(l.quantity),
      })),
    })),
  };
}

export const goodsReceiptService = {
  async getGoodsReceipts(projectId: number): Promise<GoodsReceipt[]> {
    const rows = await api.get(`/api/projects/${projectId}/goods-receipts`);
    return (rows as any[]).map(normalizeGoodsReceipt);
  },

  // Trae items + reparto por bin — el listado no.
  async getGoodsReceiptById(projectId: number, goodsReceiptId: number): Promise<GoodsReceipt> {
    const row = await api.get(`/api/projects/${projectId}/goods-receipts/${goodsReceiptId}`);
    return normalizeGoodsReceipt(row);
  },

  // Sin PUT/DELETE — movimiento inmutable, se crea completo de una sola vez.
  async createGoodsReceipt(projectId: number, data: GoodsReceiptInput): Promise<GoodsReceipt> {
    const row = await api.post(`/api/projects/${projectId}/goods-receipts`, data);
    return normalizeGoodsReceipt(row);
  },
};
