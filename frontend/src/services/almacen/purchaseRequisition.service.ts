import { api } from '../api';
import {
  PurchaseRequisitionCreateInput, PurchaseRequisitionDetail, PurchaseRequisitionItemInput,
  PurchaseRequisitionItemUpdateInput, PurchaseRequisitionListItem, PurchaseRequisitionUpdateInput,
} from '../../types/almacen.types';

// IDs de este contrato ya viajan como texto de fábrica (BIGINT) — a
// diferencia de los servicios viejos del módulo, acá no hace falta
// normalizar nada con Number().
export const purchaseRequisitionService = {
  async getRequisitions(projectId: number, search?: string): Promise<PurchaseRequisitionListItem[]> {
    const qs = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return api.get(`/api/projects/${projectId}/purchase-requisitions${qs}`);
  },

  async getRequisitionById(projectId: number, id: string): Promise<PurchaseRequisitionDetail> {
    return api.get(`/api/projects/${projectId}/purchase-requisitions/${id}`);
  },

  async createRequisition(projectId: number, data: PurchaseRequisitionCreateInput): Promise<PurchaseRequisitionDetail> {
    return api.post(`/api/projects/${projectId}/purchase-requisitions`, data);
  },

  async updateRequisition(projectId: number, id: string, data: PurchaseRequisitionUpdateInput): Promise<PurchaseRequisitionDetail> {
    return api.patch(`/api/projects/${projectId}/purchase-requisitions/${id}`, data);
  },

  // Baja lógica — también elimina el archivo físico adjunto, si tenía.
  async deleteRequisition(projectId: number, id: string): Promise<void> {
    await api.delete(`/api/projects/${projectId}/purchase-requisitions/${id}`);
  },

  // fileId null para quitar el archivo adjunto — el anterior se borra, no queda historial.
  async setFile(projectId: number, id: string, fileId: string | null): Promise<PurchaseRequisitionDetail> {
    return api.put(`/api/projects/${projectId}/purchase-requisitions/${id}/file`, { file_id: fileId });
  },

  async addItem(projectId: number, id: string, item: PurchaseRequisitionItemInput): Promise<PurchaseRequisitionDetail> {
    return api.post(`/api/projects/${projectId}/purchase-requisitions/${id}/items`, item);
  },

  async updateItem(projectId: number, id: string, itemId: string, data: PurchaseRequisitionItemUpdateInput): Promise<PurchaseRequisitionDetail> {
    return api.patch(`/api/projects/${projectId}/purchase-requisitions/${id}/items/${itemId}`, data);
  },

  // La última línea no se puede quitar (409) — el backend lo valida, acá no se duplica esa regla.
  async removeItem(projectId: number, id: string, itemId: string): Promise<PurchaseRequisitionDetail> {
    return api.delete(`/api/projects/${projectId}/purchase-requisitions/${id}/items/${itemId}`);
  },
};
