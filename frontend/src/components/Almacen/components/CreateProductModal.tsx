import React, { useEffect, useState } from 'react';
import { Field } from './FormField';
import { categoryService } from '../../../services/almacen/category.service';
import { productService } from '../../../services/almacen/product.service';
import { Category, Product } from '../../../types/almacen.types';

interface CreateProductModalProps {
  projectId: number;
  // Lo que dice el documento, para no tipearlo de nuevo (código, nombre y unidad leídos).
  prefill?: { name?: string; unit?: string; code?: string };
  onClose: () => void;
  onCreated: (product: Product) => void;
}

/** Crea un producto del catálogo sin salir del formulario. Mismas reglas que Inventario: categoría fija
 * (Partida) lleva código libre; relacional (Material/Equipo) lleva el código de su Partida y el sistema arma el final. */
const CreateProductModal: React.FC<CreateProductModalProps> = ({ projectId, prefill, onClose, onCreated }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [code, setCode] = useState(prefill?.code ?? '');
  const [name, setName] = useState(prefill?.name ?? '');
  const [unit, setUnit] = useState(prefill?.unit ?? '');
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    categoryService.getCategories(projectId).then((cats) => {
      setCategories(cats);
      setCategoryId(cats.find((c) => c.type === 'fijo')?.category_id ?? cats[0]?.category_id ?? '');
    }).catch(() => setCategories([]));
  }, [projectId]);

  const category = categories.find((c) => c.category_id === categoryId);

  const create = async () => {
    if (!category || !name.trim() || !unit.trim() || !code.trim()) {
      setError('Completá categoría, código, nombre y unidad.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await productService.createProduct(projectId, {
        category_id: category.category_id,
        code: category.type === 'fijo' ? code.trim() : undefined,
        base_product_code: category.type === 'relacional' ? code.trim() : undefined,
        name: name.trim(),
        unit: unit.trim(),
      });
      if (!modelFile) {
        onCreated(created);
        return;
      }
      // El producto ya quedó creado — si el modelo falla, no se pierde lo anterior: se puede asignar
      // después desde Inventario, como ya se podía hacer sin este campo.
      try {
        const asset = await productService.uploadModel3DAsset(modelFile);
        const withModel = await productService.assignProductModel3D(projectId, created.product_id, asset.model_3d_asset_id);
        onCreated(withModel);
      } catch {
        window.alert('El producto se creó, pero no se pudo subir el modelo 3D. Se puede asignar después desde Inventario.');
        onCreated(created);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el producto.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-gray-800 mb-1">Nuevo producto</h3>
        <p className="text-xs text-gray-400 mb-4">Se crea en el catálogo y queda elegido en esta línea. El modelo 3D es opcional acá — si no lo subes ahora, se puede asignar después desde Inventario.</p>
        <label className="block mb-3">
          <span className="text-[11px] text-gray-500 font-medium">Categoría</span>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(parseInt(e.target.value, 10))}
            className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
          >
            {categories.map((c) => <option key={c.category_id} value={c.category_id}>{c.name} ({c.type})</option>)}
          </select>
        </label>
        <Field
          label={category?.type === 'relacional' ? 'Código de la Partida relacionada' : 'Código'}
          required
          value={code}
          onChange={setCode}
          placeholder="ej. 01.02.03"
          hint={category?.type === 'relacional' ? `El código final se arma solo: ${category.prefix}-código.` : undefined}
          className="mb-3"
        />
        <div className="grid grid-cols-[1fr_7rem] gap-3 mb-4">
          <Field label="Nombre" required value={name} onChange={setName} />
          <Field label="Unidad" required value={unit} onChange={setUnit} placeholder="und, bls, m2…" />
        </div>
        <label className="block mb-4">
          <span className="text-[11px] text-gray-500 font-medium">Modelo 3D (opcional)</span>
          <input
            type="file"
            accept=".glb,.gltf"
            onChange={(e) => setModelFile(e.target.files?.[0] ?? null)}
            className="block w-full mt-1 text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-[#0056b3] hover:file:bg-blue-100"
          />
        </label>
        {error && <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={saving} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
          <button onClick={create} disabled={saving} className="flex-1 bg-[#0056b3] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[#004494] disabled:opacity-50">
            {saving ? 'Creando...' : 'Crear producto'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateProductModal;
