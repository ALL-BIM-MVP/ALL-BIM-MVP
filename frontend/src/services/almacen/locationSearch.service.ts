import { api } from '../api';
import { LocationSearchResult } from '../../types/almacen.types';

// Mismo problema de siempre: rack_id/bin_id son BIGINT, vuelven como string
// (o null, si no aplican a este resultado — ahí no hay nada que convertir).
function normalizeResult(r: any): LocationSearchResult {
  return {
    ...r,
    rack_id: r.rack_id === null ? null : Number(r.rack_id),
    bin_id: r.bin_id === null ? null : Number(r.bin_id),
  };
}

export const locationSearchService = {
  // Busca por nombre entre almacenes, estantes y casillas de una — q no puede venir vacío.
  async search(projectId: number, q: string): Promise<LocationSearchResult[]> {
    if (!q.trim()) return [];
    const rows = await api.get(`/api/projects/${projectId}/locations/search?q=${encodeURIComponent(q.trim())}`);
    return (rows as any[]).map(normalizeResult);
  },
};
