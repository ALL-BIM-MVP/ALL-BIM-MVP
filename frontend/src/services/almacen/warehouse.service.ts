import { api } from '../api';
import { Warehouse, WarehouseInput } from '../../types/almacen.types';

// Postgres devuelve las columnas NUMERIC (corner1_x/z, corner2_x/z, area_m2)
// como STRING vía node-postgres, para no perder precisión — sin este paso el
// front hacía aritmética sobre strings (ej. "1.2" + "3.4" = "1.23.4", NaN al
// dividir) y los almacenes ya guardados quedaban invisibles (posición NaN).
function normalizeWarehouse(w: any): Warehouse {
  return {
    ...w,
    corner1_x: Number(w.corner1_x),
    corner1_z: Number(w.corner1_z),
    corner2_x: Number(w.corner2_x),
    corner2_z: Number(w.corner2_z),
    area_m2: Number(w.area_m2),
  };
}

export const warehouseService = {
  async getWarehouses(projectId: number): Promise<Warehouse[]> {
    const rows = await api.get(`/api/projects/${projectId}/warehouses`);
    return (rows as any[]).map(normalizeWarehouse);
  },

  async getWarehouseById(projectId: number, warehouseId: number): Promise<Warehouse> {
    const row = await api.get(`/api/projects/${projectId}/warehouses/${warehouseId}`);
    return normalizeWarehouse(row);
  },

  async createWarehouse(projectId: number, data: WarehouseInput): Promise<Warehouse> {
    const row = await api.post(`/api/projects/${projectId}/warehouses`, data);
    return normalizeWarehouse(row);
  },

  // El PUT reemplaza TODO el registro, no es un PATCH parcial.
  async updateWarehouse(projectId: number, warehouseId: number, data: WarehouseInput): Promise<Warehouse> {
    const row = await api.put(`/api/projects/${projectId}/warehouses/${warehouseId}`, data);
    return normalizeWarehouse(row);
  },

  // Falla con 409 WAREHOUSE_HAS_RACKS si todavía tiene estantes activos.
  async deleteWarehouse(projectId: number, warehouseId: number): Promise<void> {
    await api.delete(`/api/projects/${projectId}/warehouses/${warehouseId}`);
  },
};
