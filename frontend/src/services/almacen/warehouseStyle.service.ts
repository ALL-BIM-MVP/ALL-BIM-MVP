import { api } from '../api';
import { WarehouseStyle } from '../../types/almacen.types';

export const warehouseStyleService = {
  // Catálogo global de solo lectura — 3 estilos fijos, sin endpoint para crear otros.
  async getWarehouseStyles(): Promise<WarehouseStyle[]> {
    return api.get('/api/warehouse-styles');
  },
};
