import { api } from '../api';
import { Supplier, SupplierCreateInput, SupplierUpdateInput } from '../../types/almacen.types';

export const supplierService = {
  async getSuppliers(projectId: number, search?: string): Promise<Supplier[]> {
    const qs = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
    return api.get(`/api/projects/${projectId}/suppliers${qs}`);
  },

  async createSupplier(projectId: number, data: SupplierCreateInput): Promise<Supplier> {
    return api.post(`/api/projects/${projectId}/suppliers`, data);
  },

  // El RUC no se puede tocar — solo el nombre.
  async updateSupplier(projectId: number, supplierId: number, data: SupplierUpdateInput): Promise<Supplier> {
    return api.patch(`/api/projects/${projectId}/suppliers/${supplierId}`, data);
  },

  // Falla con 409 SUPPLIER_HAS_DOCUMENTS si ya tiene cotizaciones/órdenes/facturas.
  async deleteSupplier(projectId: number, supplierId: number): Promise<void> {
    await api.delete(`/api/projects/${projectId}/suppliers/${supplierId}`);
  },
};
