import { api } from '../api';
import { Rack, RackInput } from '../../types/almacen.types';

// Mismo bloque que normalizeContent en bin.service.ts — este archivo no lo reusa porque no importa
// nada de bin.service.ts (no hace falta acoplarlos por un helper tan chico).
function normalizeContent(c: any) {
  return {
    ...c,
    bin_content_id: Number(c.bin_content_id),
    product_id: Number(c.product_id),
    quantity: Number(c.quantity),
    position_x: Number(c.position_x),
    position_y: Number(c.position_y),
    position_z: Number(c.position_z),
    rotation_x: Number(c.rotation_x),
    rotation_y: Number(c.rotation_y),
    rotation_z: Number(c.rotation_z),
    scale: c.scale != null ? Number(c.scale) : null,
  };
}

// Mismo problema de siempre: NUMERIC (corner1/corner2, quantity) Y BIGINT
// (rack_id, bin_id, product_id) vuelven los dos como string desde Postgres
// — sin esto, comparar un id así contra un número real en el frontend
// siempre daba false ("3" !== 3) y cualquier búsqueda por id fallaba en silencio.
function normalizeRack(r: any): Rack {
  return {
    ...r,
    rack_id: Number(r.rack_id),
    corner1_x: Number(r.corner1_x),
    corner1_z: Number(r.corner1_z),
    corner2_x: Number(r.corner2_x),
    corner2_z: Number(r.corner2_z),
    bins: r.bins?.map((b: any) => ({
      ...b,
      bin_id: Number(b.bin_id),
      rack_id: Number(b.rack_id),
      level: Number(b.level) + 1, // el backend cuenta niveles desde 0; la escena 3D y el tipo Bin, desde 1
      contents: b.contents?.map(normalizeContent),
    })),
  };
}

export const rackService = {
  async getRacks(projectId: number, warehouseId: number): Promise<Rack[]> {
    const rows = await api.get(`/api/projects/${projectId}/warehouses/${warehouseId}/racks`);
    return (rows as any[]).map(normalizeRack);
  },

  // El detalle trae los bins anidados con su contenido real — el listado no.
  async getRackById(projectId: number, warehouseId: number, rackId: number): Promise<Rack> {
    const row = await api.get(`/api/projects/${projectId}/warehouses/${warehouseId}/racks/${rackId}`);
    return normalizeRack(row);
  },

  async createRack(projectId: number, warehouseId: number, data: RackInput): Promise<Rack> {
    const row = await api.post(`/api/projects/${projectId}/warehouses/${warehouseId}/racks`, data);
    return normalizeRack(row);
  },

  // Un PUT de rack solo acepta el nombre — reubicar (esquinas/niveles) no
  // está soportado en esta fase; para eso, dar de baja y crear uno nuevo.
  async renameRack(projectId: number, warehouseId: number, rackId: number, name: string): Promise<Rack> {
    const row = await api.put(`/api/projects/${projectId}/warehouses/${warehouseId}/racks/${rackId}`, { name });
    return normalizeRack(row);
  },

  // Falla con 409 RACK_HAS_BINS si tiene casillas bloqueadas (con stock o en un merge).
  async deleteRack(projectId: number, warehouseId: number, rackId: number): Promise<void> {
    await api.delete(`/api/projects/${projectId}/warehouses/${warehouseId}/racks/${rackId}`);
  },
};
