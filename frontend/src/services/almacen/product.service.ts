import { api } from '../api';
import { Product, ProductCreateInput, ProductUpdateInput } from '../../types/almacen.types';

// Mismo problema de siempre: total_stock sale de un SUM sobre una
// columna NUMERIC (vuelve como string), Y product_id es BIGINT (Postgres
// también lo devuelve como string, para no perder precisión) — sin esto,
// comparar `product.product_id === idNumerico` en el frontend siempre
// daba false ("3" !== 3) y cualquier búsqueda por id fallaba en silencio.
function normalizeProduct(p: any): Product {
  return {
    ...p,
    product_id: Number(p.product_id),
    total_stock: Number(p.total_stock),
    related: p.related?.map((r: any) => ({ ...r, product_id: Number(r.product_id) })),
  };
}

export const productService = {
  async getProducts(projectId: number, categoryId?: number): Promise<Product[]> {
    const query = categoryId ? `?category_id=${categoryId}` : '';
    const rows = await api.get(`/api/projects/${projectId}/products${query}`);
    return (rows as any[]).map(normalizeProduct);
  },

  async getProductById(projectId: number, productId: number): Promise<Product> {
    const row = await api.get(`/api/projects/${projectId}/products/${productId}`);
    return normalizeProduct(row);
  },

  async createProduct(projectId: number, data: ProductCreateInput): Promise<Product> {
    const row = await api.post(`/api/projects/${projectId}/products`, data);
    return normalizeProduct(row);
  },

  // PUT reemplaza name/unit/model_3d_* — category_id/code/base_product_code no se pueden tocar tras crearlo.
  async updateProduct(projectId: number, productId: number, data: ProductUpdateInput): Promise<Product> {
    const row = await api.put(`/api/projects/${projectId}/products/${productId}`, data);
    return normalizeProduct(row);
  },

  // Falla con 409 si el producto todavía tiene stock (bin_contents.quantity > 0).
  async deleteProduct(projectId: number, productId: number): Promise<void> {
    await api.delete(`/api/projects/${projectId}/products/${productId}`);
  },

  // Sube el .glb/.gltf al mismo endpoint genérico de archivos que ya usa
  // el visor IFC (POST /api/projects/:id/files, file_type "other" — no
  // hay un tipo "modelo 3D" propio en el enum del backend). Devuelve una
  // ruta ya resoluble con getFileContentArrayBuffer(fileId) el día que
  // se cablee mostrar el modelo real de un producto.
  async uploadModel(projectId: number, file: File): Promise<{ path: string; format: 'glb' | 'gltf' }> {
    const format = file.name.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('file_type', 'other');
    const saved = await api.postFormData(`/api/projects/${projectId}/files`, formData);
    return { path: `/api/files/${saved.file_id}/content`, format };
  },
};
