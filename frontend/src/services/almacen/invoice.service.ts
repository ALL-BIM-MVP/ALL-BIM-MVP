import { api } from '../api';
import {
  InvoiceCreateInput, InvoiceDetail, InvoiceItemInput, InvoiceItemUpdateInput,
  InvoiceListItem, InvoiceUpdateInput,
} from '../../types/almacen.types';

export const invoiceService = {
  async getInvoices(projectId: number, filters: { supplierId?: number; purchaseOrderId?: string; search?: string } = {}): Promise<InvoiceListItem[]> {
    const params = new URLSearchParams();
    if (filters.supplierId) params.set('supplier_id', String(filters.supplierId));
    if (filters.purchaseOrderId) params.set('purchase_order_id', filters.purchaseOrderId);
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    const qs = params.toString();
    return api.get(`/api/projects/${projectId}/invoices${qs ? `?${qs}` : ''}`);
  },

  async getInvoiceById(projectId: number, id: string): Promise<InvoiceDetail> {
    return api.get(`/api/projects/${projectId}/invoices/${id}`);
  },

  async createInvoice(projectId: number, data: InvoiceCreateInput): Promise<InvoiceDetail> {
    return api.post(`/api/projects/${projectId}/invoices`, data);
  },

  async updateInvoice(projectId: number, id: string, data: InvoiceUpdateInput): Promise<InvoiceDetail> {
    return api.patch(`/api/projects/${projectId}/invoices/${id}`, data);
  },

  // Baja lógica — también elimina el archivo físico adjunto, si tenía.
  async deleteInvoice(projectId: number, id: string): Promise<void> {
    await api.delete(`/api/projects/${projectId}/invoices/${id}`);
  },

  async setFile(projectId: number, id: string, fileId: string | null): Promise<InvoiceDetail> {
    return api.put(`/api/projects/${projectId}/invoices/${id}/file`, { file_id: fileId });
  },

  async addItem(projectId: number, id: string, item: InvoiceItemInput): Promise<InvoiceDetail> {
    return api.post(`/api/projects/${projectId}/invoices/${id}/items`, item);
  },

  async updateItem(projectId: number, id: string, itemId: string, data: InvoiceItemUpdateInput): Promise<InvoiceDetail> {
    return api.patch(`/api/projects/${projectId}/invoices/${id}/items/${itemId}`, data);
  },

  // La última línea no se puede quitar (409) — el backend lo valida, acá no se duplica esa regla.
  async removeItem(projectId: number, id: string, itemId: string): Promise<InvoiceDetail> {
    return api.delete(`/api/projects/${projectId}/invoices/${id}/items/${itemId}`);
  },
};
