import { api } from '../api';
import { LocationHistoryResponse } from '../../types/almacen.types';

export const locationHistoryService = {
  async getBinHistory(projectId: number, warehouseId: number, rackId: number, binId: number): Promise<LocationHistoryResponse> {
    return api.get(`/api/projects/${projectId}/warehouses/${warehouseId}/racks/${rackId}/bins/${binId}/history`);
  },
};
