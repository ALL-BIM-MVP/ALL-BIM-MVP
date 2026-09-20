import { api } from '../api';
import { InventoryMovement, InventoryMovementFilters } from '../../types/almacen.types';

// Mismo problema de siempre: quantity/resulting_balance son NUMERIC Y
// todos los *_id de acá son BIGINT — los dos tipos vuelven como string.
function normalizeMovement(m: any): InventoryMovement {
  return {
    ...m,
    inventory_movement_id: Number(m.inventory_movement_id),
    product_id: Number(m.product_id),
    bin_id: Number(m.bin_id),
    reference_document_id: Number(m.reference_document_id),
    quantity: Number(m.quantity),
    resulting_balance: Number(m.resulting_balance),
  };
}

export const inventoryMovementService = {
  // 3 filtros independientes y opcionales — de solo lectura, no hay POST/PUT/DELETE.
  async getMovements(projectId: number, filters: InventoryMovementFilters = {}): Promise<InventoryMovement[]> {
    const params = new URLSearchParams();
    if (filters.product_id) params.set('product_id', String(filters.product_id));
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    const query = params.toString() ? `?${params.toString()}` : '';
    const rows = await api.get(`/api/projects/${projectId}/inventory-movements${query}`);
    return (rows as any[]).map(normalizeMovement);
  },
};
