import { api } from '../api';
import { GoodsIssue, GoodsIssueInput } from '../../types/almacen.types';

// Mismo problema de siempre: total_quantity/quantity son NUMERIC Y todos los
// *_id de acá son BIGINT — los dos tipos vuelven como string desde Postgres.
function normalizeGoodsIssue(g: any): GoodsIssue {
  return {
    ...g,
    goods_issue_id: Number(g.goods_issue_id),
    items: g.items?.map((it: any) => ({
      ...it,
      goods_issue_item_id: Number(it.goods_issue_item_id),
      goods_issue_id: Number(it.goods_issue_id),
      product_id: Number(it.product_id),
      total_quantity: Number(it.total_quantity),
      locations: it.locations?.map((l: any) => ({
        ...l,
        goods_issue_item_location_id: Number(l.goods_issue_item_location_id),
        goods_issue_item_id: Number(l.goods_issue_item_id),
        bin_id: Number(l.bin_id),
        quantity: Number(l.quantity),
      })),
    })),
  };
}

export const goodsIssueService = {
  async getGoodsIssues(projectId: number): Promise<GoodsIssue[]> {
    const rows = await api.get(`/api/projects/${projectId}/goods-issues`);
    return (rows as any[]).map(normalizeGoodsIssue);
  },

  // Trae items + reparto por bin — el listado no.
  async getGoodsIssueById(projectId: number, goodsIssueId: number): Promise<GoodsIssue> {
    const row = await api.get(`/api/projects/${projectId}/goods-issues/${goodsIssueId}`);
    return normalizeGoodsIssue(row);
  },

  // Sin PUT/DELETE — movimiento inmutable. Si algún bin no tiene stock
  // suficiente, el backend rechaza el vale COMPLETO (409 INSUFFICIENT_STOCK),
  // no queda una salida a medias.
  async createGoodsIssue(projectId: number, data: GoodsIssueInput): Promise<GoodsIssue> {
    const row = await api.post(`/api/projects/${projectId}/goods-issues`, data);
    return normalizeGoodsIssue(row);
  },
};
