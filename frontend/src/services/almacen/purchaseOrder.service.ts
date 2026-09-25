import { api } from '../api';
import {
  PurchaseOrderCreateInput, PurchaseOrderDetail, PurchaseOrderItemInput, PurchaseOrderItemUpdateInput,
  PurchaseOrderListItem, PurchaseOrderUpdateInput,
} from '../../types/almacen.types';

export const purchaseOrderService = {
  async getOrders(projectId: number, filters: { supplierId?: number; purchaseRequisitionId?: string; quotationId?: string; search?: string } = {}): Promise<PurchaseOrderListItem[]> {
    const params = new URLSearchParams();
    if (filters.supplierId) params.set('supplier_id', String(filters.supplierId));
    if (filters.purchaseRequisitionId) params.set('purchase_requisition_id', filters.purchaseRequisitionId);
    if (filters.quotationId) params.set('quotation_id', filters.quotationId);
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    const qs = params.toString();
    return api.get(`/api/projects/${projectId}/purchase-orders${qs ? `?${qs}` : ''}`);
  },

  async getOrderById(projectId: number, id: string): Promise<PurchaseOrderDetail> {
    return api.get(`/api/projects/${projectId}/purchase-orders/${id}`);
  },

  async createOrder(projectId: number, data: PurchaseOrderCreateInput): Promise<PurchaseOrderDetail> {
    return api.post(`/api/projects/${projectId}/purchase-orders`, data);
  },

  async updateOrder(projectId: number, id: string, data: PurchaseOrderUpdateInput): Promise<PurchaseOrderDetail> {
    return api.patch(`/api/projects/${projectId}/purchase-orders/${id}`, data);
  },

  // Baja lógica — también elimina el archivo físico adjunto, si tenía.
  async deleteOrder(projectId: number, id: string): Promise<void> {
    await api.delete(`/api/projects/${projectId}/purchase-orders/${id}`);
  },

  async setFile(projectId: number, id: string, fileId: string | null): Promise<PurchaseOrderDetail> {
    return api.put(`/api/projects/${projectId}/purchase-orders/${id}/file`, { file_id: fileId });
  },

  async addItem(projectId: number, id: string, item: PurchaseOrderItemInput): Promise<PurchaseOrderDetail> {
    return api.post(`/api/projects/${projectId}/purchase-orders/${id}/items`, item);
  },

  async updateItem(projectId: number, id: string, itemId: string, data: PurchaseOrderItemUpdateInput): Promise<PurchaseOrderDetail> {
    return api.patch(`/api/projects/${projectId}/purchase-orders/${id}/items/${itemId}`, data);
  },

  // La última línea no se puede quitar (409) — el backend lo valida, acá no se duplica esa regla.
  async removeItem(projectId: number, id: string, itemId: string): Promise<PurchaseOrderDetail> {
    return api.delete(`/api/projects/${projectId}/purchase-orders/${id}/items/${itemId}`);
  },
};
