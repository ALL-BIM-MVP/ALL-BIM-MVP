import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { categoryService } from '../../../../services/almacen/category.service';
import { productService } from '../../../../services/almacen/product.service';
import { Category, Model3DFormat, Product } from '../../../../types/almacen.types';
import ModelPreviewModal from '../../components/ModelPreviewModal';

const Field: React.FC<{
  label: string; value?: string; onChange?: (v: string) => void; type?: string; className?: string; placeholder?: string;
}> = ({ label, value, onChange, type = 'text', className, placeholder }) => (
  <label className={`block ${className || ''}`}>
    <span className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</span>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
    />
  </label>
);

interface InventarioProps {
  projectId: number;
}

type EditModelChoice = 'keep' | 'remove' | 'upload';

const Inventario: React.FC<InventarioProps> = ({ projectId }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [previewFileId, setPreviewFileId] = useState<number | null>(null);

  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editModelChoice, setEditModelChoice] = useState<EditModelChoice>('keep');
  const [editModelPath, setEditModelPath] = useState('');
  const [editModelFormat, setEditModelFormat] = useState<Model3DFormat>('glb');
  const [editModelFileName, setEditModelFileName] = useState('');
  const [uploadingEditModel, setUploadingEditModel] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [formCategoryId, setFormCategoryId] = useState<number | ''>('');
  const [formCode, setFormCode] = useState('');
  const [formBaseCode, setFormBaseCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [assignModel, setAssignModel] = useState(false);
  const [formModelPath, setFormModelPath] = useState('');
  const [formModelFormat, setFormModelFormat] = useState<Model3DFormat>('glb');
  const [modelFileName, setModelFileName] = useState('');
  const [uploadingModel, setUploadingModel] = useState(false);
  const [saving, setSaving] = useState(false);

  const getCategory = (id: number | undefined) => categories.find((c) => c.category_id === id);

  const loadProducts = (categoryId?: number) => {
    setLoading(true);
    productService
      .getProducts(projectId, categoryId)
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  };

  // Siempre trae datos frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    categoryService
      .getCategories(projectId)
      .then((cats) => {
        setCategories(cats);
        const partida = cats.find((c) => c.type === 'fijo');
        setFormCategoryId(partida?.category_id ?? cats[0]?.category_id ?? '');
      })
      .catch(() => setCategories([]));
    loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    loadProducts(filterCategoryId === '' ? undefined : filterCategoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterCategoryId]);

  const resetForm = () => {
    const partida = categories.find((c) => c.type === 'fijo');
    setFormCategoryId(partida?.category_id ?? categories[0]?.category_id ?? '');
    setFormCode('');
    setFormBaseCode('');
    setFormName('');
    setFormUnit('');
    setAssignModel(false);
    setFormModelPath('');
    setFormModelFormat('glb');
    setModelFileName('');
  };

  const formCategory = getCategory(formCategoryId === '' ? undefined : formCategoryId);

  const handleModelFile = async (file: File | null) => {
    if (!file) return;
    setUploadingModel(true);
    try {
      const { path, format } = await productService.uploadModel(projectId, file);
      setFormModelPath(path);
      setFormModelFormat(format);
      setModelFileName(file.name);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo subir el modelo 3D.');
    } finally {
      setUploadingModel(false);
    }
  };

  const createProduct = async () => {
    if (!formCategoryId || !formCategory || !formName.trim() || !formUnit.trim()) return;
    if (assignModel && !formModelPath.trim()) return;
    setSaving(true);
    try {
      await productService.createProduct(projectId, {
        category_id: formCategoryId,
        code: formCategory.type === 'fijo' ? formCode.trim() : undefined,
        base_product_code: formCategory.type === 'relacional' ? formBaseCode.trim() : undefined,
        name: formName.trim(),
        unit: formUnit.trim(),
        model_3d_path: assignModel ? formModelPath.trim() : undefined,
        model_3d_format: assignModel ? formModelFormat : undefined,
        model_3d_source: assignModel ? 'subido' : undefined,
      });
      resetForm();
      loadProducts(filterCategoryId === '' ? undefined : filterCategoryId);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo crear el producto.');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (id: number) => {
    productService
      .getProductById(projectId, id)
      .then((p) => {
        setDetailProduct(p);
        setEditName(p.name);
        setEditUnit(p.unit);
        setEditModelChoice('keep');
        setEditModelPath('');
        setEditModelFormat('glb');
        setEditModelFileName('');
        setView('detail');
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : 'No se pudo abrir el producto.'));
  };

  const backToList = () => {
    setView('list');
    setDetailProduct(null);
    loadProducts(filterCategoryId === '' ? undefined : filterCategoryId);
  };

  const handleEditModelFile = async (file: File | null) => {
    if (!file) return;
    setUploadingEditModel(true);
    try {
      const { path, format } = await productService.uploadModel(projectId, file);
      setEditModelPath(path);
      setEditModelFormat(format);
      setEditModelFileName(file.name);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo subir el modelo 3D.');
    } finally {
      setUploadingEditModel(false);
    }
  };

  const saveEdit = async () => {
    if (!detailProduct || !editName.trim() || !editUnit.trim()) return;
    if (editModelChoice === 'upload' && !editModelPath.trim()) {
      window.alert('Subí el archivo del modelo antes de guardar.');
      return;
    }
    setSavingEdit(true);
    try {
      const updated = await productService.updateProduct(projectId, detailProduct.product_id, {
        name: editName.trim(),
        unit: editUnit.trim(),
        model_3d_path: editModelChoice === 'remove' ? null : editModelChoice === 'upload' ? editModelPath : detailProduct.model_3d_path,
        model_3d_format: editModelChoice === 'remove' ? null : editModelChoice === 'upload' ? editModelFormat : detailProduct.model_3d_format,
        model_3d_source: editModelChoice === 'remove' ? null : editModelChoice === 'upload' ? 'subido' : detailProduct.model_3d_source,
      });
      setDetailProduct((prev) => (prev ? { ...prev, ...updated } : updated));
      setEditModelChoice('keep');
      setEditModelPath('');
      setEditModelFileName('');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo guardar el producto.');
    } finally {
      setSavingEdit(false);
    }
  };

  const removeCurrentProduct = async () => {
    if (!detailProduct) return;
    if (!window.confirm(`¿Eliminar "${detailProduct.name}"?`)) return;
    try {
      await productService.deleteProduct(projectId, detailProduct.product_id);
      backToList();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar el producto.');
    }
  };

  if (view === 'detail' && detailProduct) {
    const category = getCategory(detailProduct.category_id);
    const fileIdMatch = detailProduct.model_3d_path?.match(/\/api\/files\/(\d+)\/content/);
    const previewableFileId = fileIdMatch ? parseInt(fileIdMatch[1], 10) : null;

    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={backToList} className="text-sm text-[#0056b3] font-medium mb-3">← Volver a Productos</button>

        <div className="flex flex-col @xl:flex-row gap-4 items-start">
          <div className="w-full @xl:flex-1 space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  {category && (
                    <span className="inline-block bg-blue-50 text-[#0056b3] text-[11px] font-medium rounded-full px-2.5 py-0.5 mb-2">{category.type}</span>
                  )}
                  <h1 className="text-xl font-bold text-gray-800">{detailProduct.code} — {detailProduct.name}</h1>
                  <p className="text-sm text-gray-400 mt-0.5">Unidad: {detailProduct.unit} · tag #{detailProduct.tag}</p>
                </div>
                <button onClick={removeCurrentProduct} className="flex-shrink-0 border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-50">
                  Eliminar producto
                </button>
              </div>

              <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3 mt-4">
                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">Stock total</p>
                  <p className="text-lg font-bold text-gray-800">{detailProduct.total_stock}</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <p className="text-[11px] text-gray-400 uppercase tracking-wide">Ubicación principal</p>
                  <p className="text-sm font-semibold text-gray-800">{detailProduct.main_location ?? 'Sin stock'}</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">Materiales/Equipos relacionados</p>
              {detailProduct.related && detailProduct.related.length > 0 ? (
                <div className="grid grid-cols-1 @lg:grid-cols-2 gap-x-4 gap-y-1.5">
                  {detailProduct.related.map((r) => (
                    <p key={r.product_id} className="text-sm text-gray-600">{r.code} — {r.name}</p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 italic">Sin relacionados.</p>
              )}
            </div>
          </div>

          <div className="w-full @xl:w-96 flex-shrink-0 space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">Modelo 3D</p>
              {detailProduct.model_3d_path ? (
                <>
                  <p className="text-sm text-gray-600 break-words">
                    Asignado ({detailProduct.model_3d_source ?? '—'}) — <span className="font-mono text-xs">{detailProduct.model_3d_path}</span>
                  </p>
                  {previewableFileId && (
                    <button
                      onClick={() => setPreviewFileId(previewableFileId)}
                      className="mt-2 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Ver modelo 3D
                    </button>
                  )}
                </>
              ) : (
                <p className="text-sm text-gray-400 italic">Sin modelo 3D asignado.</p>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Editar</p>
              <div className="space-y-3 mb-3">
                <Field label="Nombre" value={editName} onChange={setEditName} />
                <Field label="Unidad" value={editUnit} onChange={setEditUnit} />
              </div>
              <label className="block mb-2">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Modelo 3D (opcional)</span>
                <select
                  value={editModelChoice}
                  onChange={(e) => setEditModelChoice(e.target.value as EditModelChoice)}
                  className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                >
                  <option value="keep">Mantener el actual</option>
                  <option value="remove">Quitar modelo</option>
                  <option value="upload">Subir nuevo archivo</option>
                </select>
              </label>
              {editModelChoice === 'upload' && (
                <div className="mb-3">
                  <input
                    type="file"
                    accept=".glb,.gltf"
                    onChange={(e) => handleEditModelFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-[#0056b3] hover:file:bg-blue-100"
                  />
                  {uploadingEditModel && <p className="text-xs text-gray-400 mt-1">Subiendo...</p>}
                  {!uploadingEditModel && editModelFileName && (
                    <p className="text-xs text-[#0056b3] mt-1">{editModelFileName} ({editModelFormat}) — listo.</p>
                  )}
                </div>
              )}
              <button
                onClick={saveEdit}
                disabled={savingEdit || uploadingEditModel}
                className="w-full bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50"
              >
                {savingEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>

        {previewFileId !== null && <ModelPreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Inventario</h1>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-sm font-semibold text-gray-700">Productos</p>
            <p className="text-xs text-gray-400">Catálogo</p>
          </div>
          <label className="block">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Filtrar por categoría</span>
            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            >
              <option value="">Todas</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 font-medium">Código</th>
              <th className="py-2 font-medium">Nombre</th>
              <th className="py-2 font-medium">Unidad</th>
              <th className="py-2 font-medium">Stock</th>
              <th className="py-2 font-medium">Ubicación principal</th>
            </tr>
          </thead>
          <tbody>
            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-300">Sin productos todavía</td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.product_id} onClick={() => openDetail(p.product_id)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50">
                <td className="py-2 font-mono text-xs text-gray-700">{p.code}</td>
                <td className="py-2 text-gray-800">{p.name}</td>
                <td className="py-2 text-gray-500">{p.unit}</td>
                <td className="py-2 text-gray-500">{p.total_stock}</td>
                <td className="py-2 text-gray-500">{p.main_location ?? 'sin stock'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 max-w-4xl">
        <p className="text-sm font-semibold text-gray-700 mb-3">Crear producto</p>

        <div className="grid grid-cols-1 @sm:grid-cols-3 @lg:grid-cols-4 gap-3 mb-3">
          <label className="block">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Categoría</span>
            <select
              value={formCategoryId}
              onChange={(e) => setFormCategoryId(parseInt(e.target.value, 10))}
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            >
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>{c.name} ({c.type})</option>
              ))}
            </select>
          </label>
          <Field label="Nombre" value={formName} onChange={setFormName} />
          <Field label="Unidad" value={formUnit} onChange={setFormUnit} placeholder="m2, bls, und..." />
        </div>

        {formCategory?.type === 'fijo' ? (
          <Field label="Código (libre)" value={formCode} onChange={setFormCode} placeholder="ej. 01.02.03" className="mb-3" />
        ) : (
          <label className="block mb-1">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Código de la Partida relacionada</span>
            <input
              value={formBaseCode}
              onChange={(e) => setFormBaseCode(e.target.value)}
              placeholder="ej. 01.02.03"
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            />
          </label>
        )}
        {formCategory?.type === 'relacional' && (
          <p className="text-[11px] text-gray-400 mb-3">El código final se arma solo: {formCategory.prefix}-código.</p>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-600 mb-3">
          <input type="checkbox" checked={assignModel} onChange={(e) => setAssignModel(e.target.checked)} className="accent-[#0056b3]" />
          Asignar modelo 3D
        </label>
        {assignModel && (
          <div className="mb-3">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Archivo del modelo (.glb / .gltf)</span>
            <input
              type="file"
              accept=".glb,.gltf"
              onChange={(e) => handleModelFile(e.target.files?.[0] ?? null)}
              className="block w-full mt-1 text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-[#0056b3] hover:file:bg-blue-100"
            />
            {uploadingModel && <p className="text-xs text-gray-400 mt-1">Subiendo...</p>}
            {!uploadingModel && modelFileName && (
              <p className="text-xs text-[#0056b3] mt-1">{modelFileName} ({formModelFormat}) — listo.</p>
            )}
          </div>
        )}

        <button
          onClick={createProduct}
          disabled={saving || uploadingModel}
          className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50"
        >
          <Plus size={15} /> Crear producto
        </button>
      </div>
    </div>
  );
};

export default Inventario;
