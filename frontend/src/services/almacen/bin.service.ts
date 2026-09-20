import { api } from '../api';
import { Bin } from '../../types/almacen.types';

// Mismo problema de siempre: bin_id/rack_id son BIGINT, y dentro de
// contents[] también product_id/quantity — todos vuelven como string.
function normalizeBin(b: any): Bin {
  return {
    ...b,
    bin_id: Number(b.bin_id),
    rack_id: Number(b.rack_id),
    contents: b.contents?.map((c: any) => ({ ...c, product_id: Number(c.product_id), quantity: Number(c.quantity) })),
  };
}

export const binService = {
  // Las casillas se generan solas al crear el rack — no hay POST/DELETE acá,
  // solo renombrar (location_label es fijo, name es libre y puede repetirse).
  async renameBin(projectId: number, warehouseId: number, rackId: number, binId: number, name: string): Promise<Bin> {
    const row = await api.patch(`/api/projects/${projectId}/warehouses/${warehouseId}/racks/${rackId}/bins/${binId}`, { name });
    return normalizeBin(row);
  },
};
