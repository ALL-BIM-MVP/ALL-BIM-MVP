import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, TriangleAlert } from 'lucide-react';
import DocumentAlerts from '../../components/DocumentAlerts';
import { purchaseRequisitionService } from '../../../../services/almacen/purchaseRequisition.service';
import { productService } from '../../../../services/almacen/product.service';
import { projectService } from '../../../../services/project.service';
import { Product, PurchaseRequisitionDetail, PurchaseRequisitionListItem } from '../../../../types/almacen.types';
import { resolveMediaUrl } from '../../../../utils/media';
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

interface RequerimientosProps {
  projectId: number;
}

interface LineDraft {
  checked: boolean;
  quantity: string;
}

const Requerimientos: React.FC<RequerimientosProps> = ({ projectId }) => {
  const [requisitions, setRequisitions] = useState<PurchaseRequisitionListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState<Product[]>([]);

  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [detail, setDetail] = useState<PurchaseRequisitionDetail | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [formNumber, setFormNumber] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formRequester, setFormRequester] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [lineDrafts, setLineDrafts] = useState<Record<number, LineDraft>>({});
  const [saving, setSaving] = useState(false);

  const [addingLine, setAddingLine] = useState(false);
  const [newLineProductId, setNewLineProductId] = useState<number | ''>('');
  const [newLineDescription, setNewLineDescription] = useState('');
  const [newLineQuantity, setNewLineQuantity] = useState('');
  const [newLinePrice, setNewLinePrice] = useState('');
  const [savingLine, setSavingLine] = useState(false);

  const loadRequisitions = (term?: string) => {
    setLoading(true);
    purchaseRequisitionService
      .getRequisitions(projectId, term)
      .then(setRequisitions)
      .catch(() => setRequisitions([]))
      .finally(() => setLoading(false));
  };

  // Siempre trae datos frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    loadRequisitions();
    productService.getProducts(projectId).then(setProducts).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Búsqueda con un pequeño debounce, para no pegarle al backend en cada tecla.
  useEffect(() => {
    if (!projectId) return;
    const timer = setTimeout(() => loadRequisitions(search), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const resetCreateForm = () => {
    setFormNumber('');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormRequester('');
    setFormNotes('');
    setLineDrafts({});
  };

  const toggleLine = (productId: number, checked: boolean) => {
    setLineDrafts((prev) => ({ ...prev, [productId]: { checked, quantity: prev[productId]?.quantity ?? '' } }));
  };

  const setLineQuantity = (productId: number, quantity: string) => {
    setLineDrafts((prev) => ({ ...prev, [productId]: { checked: prev[productId]?.checked ?? true, quantity } }));
  };

  const createRequisition = async () => {
    const items = Object.entries(lineDrafts)
      .filter(([, draft]) => draft.checked && parseFloat(draft.quantity) > 0)
      .map(([productId, draft]) => {
        const product = products.find((p) => p.product_id === Number(productId));
        return {
          product_id: Number(productId),
          description: product?.name ?? '',
          quantity_requested: parseFloat(draft.quantity),
        };
      });
    if (!formNumber.trim() || !formRequester.trim() || items.length === 0) {
      window.alert('Completá número, solicitante y al menos una línea con cantidad.');
      return;
    }
    setSaving(true);
    try {
      await purchaseRequisitionService.createRequisition(projectId, {
        number: formNumber.trim(),
        requisition_date: formDate,
        requester: formRequester.trim(),
        notes: formNotes.trim() || null,
        items,
      });
      setView('list');
      resetCreateForm();
      loadRequisitions(search);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo crear el requerimiento.');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (id: string) => {
    purchaseRequisitionService
      .getRequisitionById(projectId, id)
      .then((d) => {
        setDetail(d);
        setView('detail');
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : 'No se pudo abrir el requerimiento.'));
  };

  const backToList = () => {
    setView('list');
    setDetail(null);
    setAddingLine(false);
    loadRequisitions(search);
  };

  const removeRequisition = async () => {
    if (!detail) return;
    if (!window.confirm(`¿Eliminar el requerimiento ${detail.number}?`)) return;
    try {
      await purchaseRequisitionService.deleteRequisition(projectId, detail.purchase_requisition_id);
      backToList();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar el requerimiento.');
    }
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file || !detail) return;
    setUploadingFile(true);
    try {
      const uploaded = await projectService.uploadFile(projectId, file, 'almacen');
      const updated = await purchaseRequisitionService.setFile(projectId, detail.purchase_requisition_id, uploaded.file_id);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo adjuntar el archivo.');
    } finally {
      setUploadingFile(false);
    }
  };

  const removeFile = async () => {
    if (!detail) return;
    try {
      const updated = await purchaseRequisitionService.setFile(projectId, detail.purchase_requisition_id, null);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar el archivo.');
    }
  };

  const startAddLine = () => {
    setAddingLine(true);
    setNewLineProductId('');
    setNewLineDescription('');
    setNewLineQuantity('');
    setNewLinePrice('');
  };

  const confirmAddLine = async () => {
    if (!detail || !newLineProductId || !newLineQuantity.trim()) return;
    setSavingLine(true);
    try {
      const updated = await purchaseRequisitionService.addItem(projectId, detail.purchase_requisition_id, {
        product_id: Number(newLineProductId),
        description: newLineDescription.trim() || (products.find((p) => p.product_id === Number(newLineProductId))?.name ?? ''),
        quantity_requested: parseFloat(newLineQuantity),
        estimated_unit_price: newLinePrice.trim() ? parseFloat(newLinePrice) : null,
      });
      setDetail(updated);
      setAddingLine(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo agregar la línea.');
    } finally {
      setSavingLine(false);
    }
  };

  const removeLine = async (itemId: string) => {
    if (!detail) return;
    if (!window.confirm('¿Quitar esta línea?')) return;
    try {
      const updated = await purchaseRequisitionService.removeItem(projectId, detail.purchase_requisition_id, itemId);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar la línea.');
    }
  };

  if (view === 'new') {
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={() => { setView('list'); resetCreateForm(); }} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 mb-3">
          <ArrowLeft size={15} /> Volver a Requerimientos
        </button>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Nuevo requerimiento</h1>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3 mb-3">
            <Field label="Número" value={formNumber} onChange={setFormNumber} placeholder="ej. REQ-001" />
            <Field label="Fecha" type="date" value={formDate} onChange={setFormDate} />
          </div>
          <Field label="Solicitante" value={formRequester} onChange={setFormRequester} placeholder="ej. Ing. Rojas — Obra" className="mb-3" />
          <Field label="Observaciones" value={formNotes} onChange={setFormNotes} placeholder="ej. Segundo tramo de columnas" className="mb-3" />

          <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-2">Líneas</p>
          <div className="space-y-2 mb-4 max-h-96 overflow-y-auto">
            {products.map((p) => (
              <div key={p.product_id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2">
                <input
                  type="checkbox"
                  checked={lineDrafts[p.product_id]?.checked ?? false}
                  onChange={(e) => toggleLine(p.product_id, e.target.checked)}
                  className="accent-[#0056b3]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{p.code} — {p.name}</p>
                  <p className="text-xs text-gray-400">{p.unit}</p>
                </div>
                <input
                  type="number"
                  placeholder="Cantidad"
                  value={lineDrafts[p.product_id]?.quantity ?? ''}
                  onChange={(e) => setLineQuantity(p.product_id, e.target.value)}
                  disabled={!lineDrafts[p.product_id]?.checked}
                  className="w-24 px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] disabled:bg-gray-50"
                />
              </div>
            ))}
            {products.length === 0 && <p className="text-sm text-gray-400 italic">No hay productos en el catálogo todavía.</p>}
          </div>

          <div className="flex justify-end">
            <button
              onClick={createRequisition}
              disabled={saving}
              className="px-8 bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50"
            >
              {saving ? 'Creando...' : 'Crear requerimiento'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'detail' && detail) {
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={backToList} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 mb-3">
          <ArrowLeft size={15} /> Volver a Requerimientos
        </button>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{detail.number}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{detail.requester} · {detail.requisition_date}</p>
              {detail.notes && <p className="text-sm text-gray-600 mt-2">{detail.notes}</p>}
            </div>
            <button onClick={removeRequisition} className="flex-shrink-0 border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-50">
              Eliminar requerimiento
            </button>
          </div>

          <div className="grid grid-cols-3 @sm:grid-cols-6 gap-2 mt-4">
            {[
              { label: 'Líneas', value: detail.summary.lines },
              { label: 'Cotizadas', value: detail.summary.quoted },
              { label: 'Ordenadas', value: detail.summary.ordered },
              { label: 'Facturadas', value: detail.summary.invoiced },
              { label: 'Recibidas', value: detail.summary.received },
              { label: 'Completas', value: detail.summary.fully_received },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-lg px-2 py-2 text-center">
                <p className="text-sm font-bold text-gray-800">{s.value}</p>
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <DocumentAlerts alerts={detail.alerts} />

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Archivo</p>
          {detail.file ? (
            <div className="flex items-center justify-between gap-3">
              <a href={resolveMediaUrl(detail.file.url)} target="_blank" rel="noreferrer" className="text-sm text-[#0056b3] hover:underline truncate">
                {detail.file.name}
              </a>
              <button onClick={removeFile} className="text-xs text-red-500 font-medium hover:underline flex-shrink-0">Quitar</button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-400 italic mb-2">Archivo pendiente.</p>
              <input
                type="file"
                onChange={(e) => handleFileUpload(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-[#0056b3] hover:file:bg-blue-100"
              />
              {uploadingFile && <p className="text-xs text-gray-400 mt-1">Subiendo...</p>}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-700">Líneas</p>
            <button onClick={startAddLine} className="flex items-center gap-1.5 text-xs font-semibold text-[#0056b3] hover:underline">
              <Plus size={14} /> Agregar línea
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 font-medium">Descripción</th>
                <th className="py-2 font-medium">Cantidad</th>
                <th className="py-2 font-medium">Precio est.</th>
                <th className="py-2 font-medium">Avance</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {detail.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-300">Sin líneas</td>
                </tr>
              )}
              {detail.items.map((item) => (
                <tr key={item.purchase_requisition_item_id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-800">{item.product ? `${item.product.code} — ${item.product.name}` : '—'}</td>
                  <td className="py-2 text-gray-600">{item.description}</td>
                  <td className="py-2 text-gray-700">{trimNumeric(item.quantity_requested)} {item.product?.unit ?? ''}</td>
                  <td className="py-2 text-gray-500">{item.estimated_unit_price != null ? trimNumeric(item.estimated_unit_price) : '—'}</td>
                  <td className="py-2 text-gray-500 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span>{item.progress.offers_count} oferta(s) · ordenado {trimNumeric(item.progress.ordered)} · recibido {trimNumeric(item.progress.received)}</span>
                      {item.alerts.length > 0 && (
                        <span title={item.alerts.map((a) => a.message).join(' — ')}>
                          <TriangleAlert size={13} className="text-amber-500 flex-shrink-0" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => removeLine(item.purchase_requisition_item_id)} className="text-gray-300 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {addingLine && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 @sm:grid-cols-4 gap-3">
              <label className="block">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Producto</span>
                <select
                  value={newLineProductId}
                  onChange={(e) => setNewLineProductId(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                >
                  <option value="">Elegir...</option>
                  {products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>{p.code} — {p.name}</option>
                  ))}
                </select>
              </label>
              <Field label="Descripción (opcional)" value={newLineDescription} onChange={setNewLineDescription} />
              <Field label="Cantidad" type="number" value={newLineQuantity} onChange={setNewLineQuantity} />
              <Field label="Precio est. (opcional)" type="number" value={newLinePrice} onChange={setNewLinePrice} />
              <div className="@sm:col-span-4 flex gap-2">
                <button onClick={confirmAddLine} disabled={savingLine} className="bg-[#0056b3] text-white rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-[#004494] disabled:opacity-50">
                  {savingLine ? 'Guardando...' : 'Agregar'}
                </button>
                <button onClick={() => setAddingLine(false)} className="border border-gray-200 rounded-lg px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Requerimientos</h1>
          <p className="text-sm text-gray-400">Lo que se pide a la obra. Cada línea es un producto real del catálogo.</p>
        </div>
        <button
          onClick={() => setView('new')}
          className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors"
        >
          <Plus size={15} /> Nuevo requerimiento
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <label className="block mb-3">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Buscar</span>
          <div className="flex gap-2 mt-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Número o proveedor..."
              className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            />
            <button
              onClick={() => loadRequisitions(search)}
              className="border border-gray-200 rounded-lg px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Filtrar
            </button>
          </div>
        </label>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 font-medium">Número</th>
              <th className="py-2 font-medium">Solicitante</th>
              <th className="py-2 font-medium">Observación</th>
              <th className="py-2 font-medium">Líneas</th>
              <th className="py-2 font-medium">Fecha</th>
              <th className="py-2 font-medium">Archivo</th>
            </tr>
          </thead>
          <tbody>
            {!loading && requisitions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-300">Todavía no hay documentos.</td>
              </tr>
            )}
            {requisitions.map((r) => (
              <tr key={r.purchase_requisition_id} onClick={() => openDetail(r.purchase_requisition_id)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50">
                <td className="py-2 font-mono text-xs text-gray-700">{r.number}</td>
                <td className="py-2 text-gray-800">{r.requester}</td>
                <td className="py-2 text-gray-500 truncate max-w-xs">{r.notes ?? '—'}</td>
                <td className="py-2 text-gray-500">{r.items_count}</td>
                <td className="py-2 text-gray-500">{r.requisition_date}</td>
                <td className="py-2">
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${r.has_file ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                    {r.has_file ? 'Archivo' : 'Archivo pendiente'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Requerimientos;
