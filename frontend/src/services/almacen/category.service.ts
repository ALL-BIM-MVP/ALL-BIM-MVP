import { api } from '../api';
import { Category } from '../../types/almacen.types';

export const categoryService = {
  // Exactamente 3 por proyecto, fijas — de solo lectura, no hay endpoint para crear/editar/borrar.
  async getCategories(projectId: number): Promise<Category[]> {
    return api.get(`/api/projects/${projectId}/categories`);
  },
};
