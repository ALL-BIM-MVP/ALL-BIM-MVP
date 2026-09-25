import { api } from '../api';
import {
  QuotationCreateInput, QuotationDetail, QuotationItemInput, QuotationItemUpdateInput,
  QuotationListItem, QuotationUpdateInput,
} from '../../types/almacen.types';

export const quotationService = {
  async getQuotations(projectId: number, filters: { purchaseRequisitionId?: string; supplierId?: number; search?: string } = {}): Promise<QuotationListItem[]> {
    const params = new URLSearchParams();
    if (filters.purchaseRequisitionId) params.set('purchase_requisition_id', filters.purchaseRequisitionId);
    if (filters.supplierId) params.set('supplier_id', String(filters.supplierId));
    if (filters.search?.trim()) params.set('search', filters.search.trim());
    const qs = params.toString();
    return api.get(`/api/projects/${projectId}/quotations${qs ? `?${qs}` : ''}`);
  },

  async getQuotationById(projectId: number, id: string): Promise<QuotationDetail> {
    return api.get(`/api/projects/${projectId}/quotations/${id}`);
  },

  async createQuotation(projectId: number, data: QuotationCreateInput): Promise<QuotationDetail> {
    return api.post(`/api/projects/${projectId}/quotations`, data);
  },

  async updateQuotation(projectId: number, id: string, data: QuotationUpdateInput): Promise<QuotationDetail> {
    return api.patch(`/api/projects/${projectId}/quotations/${id}`, data);
  },

  // Baja lógica — también elimina el archivo físico adjunto, si tenía.
  async deleteQuotation(projectId: number, id: string): Promise<void> {
    await api.delete(`/api/projects/${projectId}/quotations/${id}`);
  },

  async setFile(projectId: number, id: string, fileId: string | null): Promise<QuotationDetail> {
    return api.put(`/api/projects/${projectId}/quotations/${id}/file`, { file_id: fileId });
  },

  async addItem(projectId: number, id: string, item: QuotationItemInput): Promise<QuotationDetail> {
    return api.post(`/api/projects/${projectId}/quotations/${id}/items`, item);
  },

  async updateItem(projectId: number, id: string, itemId: string, data: QuotationItemUpdateInput): Promise<QuotationDetail> {
    return api.patch(`/api/projects/${projectId}/quotations/${id}/items/${itemId}`, data);
  },

  // La última línea no se puede quitar (409) — el backend lo valida, acá no se duplica esa regla.
  async removeItem(projectId: number, id: string, itemId: string): Promise<QuotationDetail> {
    return api.delete(`/api/projects/${projectId}/quotations/${id}/items/${itemId}`);
  },
};
