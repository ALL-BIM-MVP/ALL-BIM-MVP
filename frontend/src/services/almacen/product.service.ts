import { api } from '../api';
import { Model3DAsset, Product, ProductCreateInput, ProductHistoryResponse, ProductUpdateInput } from '../../types/almacen.types';

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

  // Hoja de vida del producto (Fase 9) — solo lectura, no depende de las fechas para el stock actual.
  async getProductHistory(projectId: number, productId: number, filters: { binId?: number; from?: string; to?: string } = {}): Promise<ProductHistoryResponse> {
    const params = new URLSearchParams();
    if (filters.binId) params.set('bin_id', String(filters.binId));
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    const qs = params.toString();
    return api.get(`/api/projects/${projectId}/products/${productId}/history${qs ? `?${qs}` : ''}`);
  },

  // Sube un .glb/.gltf NUEVO a la biblioteca personal del usuario (sin proyecto, ver
  // model-3d-asset.service.ts del backend) — todavía no queda asignado a ningún producto.
  async uploadModel3DAsset(file: File): Promise<Model3DAsset> {
    const formData = new FormData();
    formData.append('file', file);
    return api.postFormData('/api/model-3d-assets', formData);
  },

  // Catálogo de modelos visibles desde este proyecto (míos + del sistema + ya usados acá) — para
  // reusar uno ya subido en vez de volver a subir el archivo.
  async listModel3DAssets(projectId: number): Promise<Model3DAsset[]> {
    return api.get(`/api/projects/${projectId}/model-3d-assets`);
  },

  // Asigna un model_3d_asset_id YA existente a un producto, o null para sacarlo — nunca crea un
  // asset nuevo acá (eso es uploadModel3DAsset, un paso aparte).
  async assignProductModel3D(projectId: number, productId: number, model3dAssetId: number | null): Promise<Product> {
    const row = await api.put(`/api/projects/${projectId}/products/${productId}/model-3d`, { model_3d_asset_id: model3dAssetId });
    return normalizeProduct(row);
  },

  async getModel3DAssetContentArrayBuffer(projectId: number, assetId: number): Promise<ArrayBuffer> {
    const blob = await api.getBlob(`/api/projects/${projectId}/model-3d-assets/${assetId}/content`);
    return blob.arrayBuffer();
  },
};
