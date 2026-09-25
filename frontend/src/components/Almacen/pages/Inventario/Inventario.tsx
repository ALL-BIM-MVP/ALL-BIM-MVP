import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { categoryService } from '../../../../services/almacen/category.service';
import { productService } from '../../../../services/almacen/product.service';
import { Category, Model3DAsset, Product, ProductHistoryResponse } from '../../../../types/almacen.types';
import ModelPreviewModal from '../../components/ModelPreviewModal';
import { trimNumeric } from '../../../../utils/numberFormat';

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

const Inventario: React.FC<InventarioProps> = ({ projectId }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [filterCategoryId, setFilterCategoryId] = useState<number | ''>('');
  const [loading, setLoading] = useState(false);

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<number | null>(null);

  const [history, setHistory] = useState<ProductHistoryResponse | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');

  const [editName, setEditName] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Modelo 3D del producto en detalle — se asigna con endpoints propios, no forma parte de "Editar".
  const [modelAssets, setModelAssets] = useState<Model3DAsset[]>([]);
  const [pickedAssetId, setPickedAssetId] = useState<number | ''>('');
  const [assigningModel, setAssigningModel] = useState(false);

  const [formCategoryId, setFormCategoryId] = useState<number | ''>('');
  const [formCode, setFormCode] = useState('');
  const [formBaseCode, setFormBaseCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState('');
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
  };

  const formCategory = getCategory(formCategoryId === '' ? undefined : formCategoryId);

  // Un producto siempre nace sin modelo 3D — se asigna después, desde su detalle (ver
  // assignProductModel3D en product.service.ts y el panel "Modelo 3D" más abajo).
  const createProduct = async () => {
    if (!formCategoryId || !formCategory || !formName.trim() || !formUnit.trim()) return;
    setSaving(true);
    try {
      await productService.createProduct(projectId, {
        category_id: formCategoryId,
        code: formCategory.type === 'fijo' ? formCode.trim() : undefined,
        base_product_code: formCategory.type === 'relacional' ? formBaseCode.trim() : undefined,
        name: formName.trim(),
        unit: formUnit.trim(),
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
        setPickedAssetId('');
        setHistoryFrom('');
        setHistoryTo('');
        setView('detail');
        loadHistory(id);
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : 'No se pudo abrir el producto.'));
    productService.listModel3DAssets(projectId).then(setModelAssets).catch(() => setModelAssets([]));
  };

  const loadHistory = (productId: number, filters: { from?: string; to?: string } = {}) => {
    setLoadingHistory(true);
    productService
      .getProductHistory(projectId, productId, filters)
      .then(setHistory)
      .catch(() => setHistory(null))
      .finally(() => setLoadingHistory(false));
  };

  const backToList = () => {
    setView('list');
    setDetailProduct(null);
    setHistory(null);
    loadProducts(filterCategoryId === '' ? undefined : filterCategoryId);
  };

  const saveEdit = async () => {
    if (!detailProduct || !editName.trim() || !editUnit.trim()) return;
    setSavingEdit(true);
    try {
      const updated = await productService.updateProduct(projectId, detailProduct.product_id, {
        name: editName.trim(),
        unit: editUnit.trim(),
      });
      setDetailProduct((prev) => (prev ? { ...prev, ...updated } : updated));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo guardar el producto.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Subir un archivo NUEVO y asignarlo son dos pasos del backend (ver product.service.ts) — acá se
  // encadenan en una sola acción para no exigirle al usuario un "Guardar" aparte.
  const uploadAndAssignModel = async (file: File | null) => {
    if (!file || !detailProduct) return;
    setAssigningModel(true);
    try {
      const asset = await productService.uploadModel3DAsset(file);
      const updated = await productService.assignProductModel3D(projectId, detailProduct.product_id, asset.model_3d_asset_id);
      setDetailProduct((prev) => (prev ? { ...prev, ...updated } : updated));
      setModelAssets((prev) => [asset, ...prev]);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo asignar el modelo 3D.');
    } finally {
      setAssigningModel(false);
    }
  };

  const assignExistingModel = async () => {
    if (!detailProduct || !pickedAssetId) return;
    setAssigningModel(true);
    try {
      const updated = await productService.assignProductModel3D(projectId, detailProduct.product_id, Number(pickedAssetId));
      setDetailProduct((prev) => (prev ? { ...prev, ...updated } : updated));
      setPickedAssetId('');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo asignar el modelo 3D.');
    } finally {
      setAssigningModel(false);
    }
  };

  const removeModel = async () => {
    if (!detailProduct) return;
    setAssigningModel(true);
    try {
      const updated = await productService.assignProductModel3D(projectId, detailProduct.product_id, null);
      setDetailProduct((prev) => (prev ? { ...prev, ...updated } : updated));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar el modelo 3D.');
    } finally {
      setAssigningModel(false);
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
    const availableAssets = modelAssets.filter((a) => a.model_3d_asset_id !== detailProduct.model_3d_asset_id);

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

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-1">Historial</p>
              <p className="text-xs text-gray-400 mb-3">
                No maneja lotes: no se sabe qué unidades salieron de qué ingreso puntual — solo el recorrido de compras y los movimientos de stock.
              </p>

              <div className="flex items-end gap-2 mb-4">
                <Field label="Desde" type="date" value={historyFrom} onChange={setHistoryFrom} />
                <Field label="Hasta" type="date" value={historyTo} onChange={setHistoryTo} />
                <button
                  onClick={() => loadHistory(detailProduct.product_id, { from: historyFrom || undefined, to: historyTo || undefined })}
                  className="border border-gray-200 rounded-lg px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Filtrar
                </button>
              </div>

              {loadingHistory && <p className="text-sm text-gray-400">Cargando...</p>}

              {history && (
                <>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="bg-gray-50 rounded-lg px-2 py-2 text-center">
                      <p className="text-sm font-bold text-green-600">+{trimNumeric(history.totals.entered)}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Entrado</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-2 py-2 text-center">
                      <p className="text-sm font-bold text-red-500">-{trimNumeric(history.totals.exited)}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Salido</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg px-2 py-2 text-center">
                      <p className="text-sm font-bold text-gray-800">{trimNumeric(history.totals.net)}</p>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide">Neto</p>
                    </div>
                  </div>

                  {history.stock.by_bin.length > 0 && (
                    <div className="mb-4">
                      <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1.5">Stock por casilla (actual)</p>
                      {history.stock.by_bin.map((b) => (
                        <div key={b.bin_id} className="flex items-center justify-between text-sm text-gray-600 py-0.5">
                          <span>{b.label}</span>
                          <span className="font-semibold text-gray-800">{trimNumeric(b.quantity)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-1.5">Línea de tiempo</p>
                  {history.items.length === 0 && <p className="text-sm text-gray-300 italic">Sin movimientos en este rango.</p>}
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {history.items.map((item, i) => {
                      const documents = item.type === 'entrada'
                        ? [...item.documents.requisitions, ...item.documents.quotations, ...item.documents.purchase_orders, ...item.documents.invoices]
                        : [];
                      return (
                        <div key={i} className="border-b border-gray-50 pb-2 last:border-0">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-semibold ${item.type === 'entrada' ? 'text-green-600' : 'text-red-500'}`}>
                              {item.type === 'entrada' ? (item.status === 'en_curso' ? 'Entrada (en curso)' : 'Entrada') : 'Salida'}
                              {item.voided && <span className="text-gray-400 font-normal"> · anulado</span>}
                            </span>
                            <span className="text-xs text-gray-400">{item.date}</span>
                          </div>
                          <p className="text-xs text-gray-500">
                            {item.label}
                            {item.quantity_effective !== null && ` · ${trimNumeric(item.quantity_effective)}`}
                          </p>
                          {item.type === 'entrada' && item.receipt?.supplier && (
                            <p className="text-xs text-gray-400">{item.receipt.supplier.name}</p>
                          )}
                          {item.type === 'salida' && (
                            <p className="text-xs text-gray-400">
                              Destino: {[item.issue.destination_sector, item.issue.destination_level, item.issue.destination_block].filter(Boolean).join(' / ')} · Retiró: {item.issue.recipient_name}
                            </p>
                          )}
                          {documents.length > 0 && (
                            <p className="text-xs text-gray-400">{documents.map((d) => d.label).join(' → ')}</p>
                          )}
                          {item.locations.map((loc) => (
                            <p key={loc.bin_id} className="text-xs text-gray-400">
                              {loc.label} · {trimNumeric(loc.quantity)}{loc.balance_after !== null && ` · saldo ${trimNumeric(loc.balance_after)}`}
                            </p>
                          ))}
                          {item.adjustments.map((adj) => (
                            <p key={adj.inventory_adjustment_id} className="text-xs text-amber-600">
                              {adj.kind === 'anulacion' ? 'Anulación' : 'Corrección'}: {adj.reason}
                            </p>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="w-full @xl:w-96 flex-shrink-0 space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">Modelo 3D</p>
              {detailProduct.model_3d_asset_id !== null ? (
                <>
                  <p className="text-sm text-gray-600 break-words">
                    {detailProduct.model_3d_name} ({detailProduct.model_3d_format})
                  </p>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setPreviewAssetId(detailProduct.model_3d_asset_id)}
                      className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Ver modelo 3D
                    </button>
                    <button
                      onClick={removeModel}
                      disabled={assigningModel}
                      className="border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                    >
                      Quitar
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 italic mb-2">Sin modelo 3D asignado.</p>
              )}

              <div className="mt-3 pt-3 border-t border-gray-100">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Subir un archivo nuevo (.glb / .gltf)</span>
                <input
                  type="file"
                  accept=".glb,.gltf"
                  onChange={(e) => uploadAndAssignModel(e.target.files?.[0] ?? null)}
                  disabled={assigningModel}
                  className="block w-full mt-1 text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-[#0056b3] hover:file:bg-blue-100"
                />
              </div>

              {availableAssets.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <span className="text-[11px] text-gray-400 uppercase tracking-wide">O reusar uno ya subido</span>
                  <div className="flex gap-2 mt-1">
                    <select
                      value={pickedAssetId}
                      onChange={(e) => setPickedAssetId(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                      className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                    >
                      <option value="">Elegir...</option>
                      {availableAssets.map((a) => (
                        <option key={a.model_3d_asset_id} value={a.model_3d_asset_id}>{a.name} ({a.format})</option>
                      ))}
                    </select>
                    <button
                      onClick={assignExistingModel}
                      disabled={!pickedAssetId || assigningModel}
                      className="bg-[#0056b3] text-white rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-[#004494] disabled:opacity-50"
                    >
                      Asignar
                    </button>
                  </div>
                </div>
              )}
              {assigningModel && <p className="text-xs text-gray-400 mt-2">Guardando...</p>}
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <p className="text-sm font-semibold text-gray-700 mb-3">Editar</p>
              <div className="space-y-3 mb-3">
                <Field label="Nombre" value={editName} onChange={setEditName} />
                <Field label="Unidad" value={editUnit} onChange={setEditUnit} />
              </div>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="w-full bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50"
              >
                {savingEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>

        {previewAssetId !== null && (
          <ModelPreviewModal projectId={projectId} assetId={previewAssetId} onClose={() => setPreviewAssetId(null)} />
        )}
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

        <p className="text-xs text-gray-400 mb-3">El modelo 3D se asigna después de crear el producto, desde su detalle.</p>

        <button
          onClick={createProduct}
          disabled={saving}
          className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50"
        >
          <Plus size={15} /> Crear producto
        </button>
      </div>
    </div>
  );
};

export default Inventario;
