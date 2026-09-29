import { api } from '../api';
import { Bin, BinContent } from '../../types/almacen.types';

// Mismo problema de siempre: bin_id/rack_id son BIGINT, y dentro de
// contents[] también product_id/quantity/bin_content_id — todos vuelven como string.
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

function normalizeBin(b: any): Bin {
  return {
    ...b,
    bin_id: Number(b.bin_id),
    rack_id: Number(b.rack_id),
    contents: b.contents?.map(normalizeContent),
  };
}

export const binService = {
  // Las casillas se generan solas al crear el rack — no hay POST/DELETE acá,
  // solo renombrar (location_label es fijo, name es libre y puede repetirse).
  async renameBin(projectId: number, warehouseId: number, rackId: number, binId: number, name: string): Promise<Bin> {
    const row = await api.patch(`/api/projects/${projectId}/warehouses/${warehouseId}/racks/${rackId}/bins/${binId}`, { name });
    return normalizeBin(row);
  },

  // Ajuste visual de un contenido ya ingresado (posición fina, rotación en radianes, escala) — aparte
  // del ingreso, no genera Kardex ni pasa por ajustes de inventario. Manda solo lo que cambió.
  // El backend devuelve SOLO la pose (bin_content_id + los 7 campos), no el producto — quien llama
  // tiene que combinarlo con el contenido que ya tenía, no reemplazarlo entero.
  async updateContentPose(
    projectId: number, warehouseId: number, rackId: number, binId: number, binContentId: number,
    data: Partial<Pick<BinContent, 'position_x' | 'position_y' | 'position_z' | 'rotation_x' | 'rotation_y' | 'rotation_z' | 'scale'>>
  ): Promise<Pick<BinContent, 'bin_content_id' | 'position_x' | 'position_y' | 'position_z' | 'rotation_x' | 'rotation_y' | 'rotation_z' | 'scale'>> {
    const row = await api.patch(
      `/api/projects/${projectId}/warehouses/${warehouseId}/racks/${rackId}/bins/${binId}/contents/${binContentId}`, data
    );
    return {
      bin_content_id: Number(row.bin_content_id),
      position_x: Number(row.position_x),
      position_y: Number(row.position_y),
      position_z: Number(row.position_z),
      rotation_x: Number(row.rotation_x),
      rotation_y: Number(row.rotation_y),
      rotation_z: Number(row.rotation_z),
      scale: row.scale != null ? Number(row.scale) : null,
    };
  },
};
