import React, { useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import DocumentAlerts from '../../components/DocumentAlerts';
import EditForm from '../../components/EditForm';
import DocumentPanel from '../../components/DocumentPanel';
import ProductPicker from '../../components/ProductPicker';
import SearchCombobox from '../../components/SearchCombobox';
import { useDocumentFile } from '../../components/useDocumentFile';
import { purchaseRequisitionService } from '../../../../services/almacen/purchaseRequisition.service';
import { productService } from '../../../../services/almacen/product.service';
import { projectService } from '../../../../services/project.service';
import { DraftItemMatch, DraftProductCandidate, DraftWarning, Product, PurchaseRequisitionDetail, PurchaseRequisitionListItem } from '../../../../types/almacen.types';
import { resolveMediaUrl } from '../../../../utils/media';
import { trimNumeric } from '../../../../utils/numberFormat';

// flag: "ai" = lo llenó la IA (a revisar); "warn" = lo llenó la IA y además tiene un aviso.
const Field: React.FC<{
  label: string; value?: string; onChange?: (v: string) => void; type?: string; className?: string; placeholder?: string;
  required?: boolean; flag?: 'ai' | 'warn'; message?: string;
}> = ({ label, value, onChange, type = 'text', className, placeholder, required, flag, message }) => (
  <label className={`block ${className || ''}`}>
    <span className="text-[11px] text-gray-500 font-medium">{label}{required && <span className="text-red-500"> *</span>}</span>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      className={`w-full mt-1 px-2.5 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] ${flag === 'warn' ? 'border-amber-400 bg-amber-50' : flag === 'ai' ? 'border-violet-300 bg-violet-50' : 'border-gray-200'}`}
    />
    {message && <span className="block text-[11px] text-amber-600 mt-0.5">{message}</span>}
  </label>
);

interface RequerimientosProps {
  projectId: number;
}

interface ReqLine {
  key: number;
  product: Product | null;
  description: string;
  quantity: string;
  price: string;
  candidates: DraftProductCandidate[]; // sugeridos por la IA cuando no hubo coincidencia clara
  read?: DraftItemMatch['read'] | null; // lo que dijo el papel en esa línea (código, unidad)
  ai: boolean;
}

let lineKey = 0;
const emptyLine = (): ReqLine => ({ key: ++lineKey, product: null, description: '', quantity: '', price: '', candidates: [], ai: false });

// Los avisos más graves primero: un "documento repetido" no puede quedar debajo de uno cosmético.
const WARNING_ORDER = ['DUPLICATE_DOCUMENT', 'DETECTED_TYPE_MISMATCH', 'NO_ITEMS'];
const warningRank = (w: DraftWarning) => { const i = WARNING_ORDER.indexOf(w.code); return i === -1 ? WARNING_ORDER.length : i; };

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
  const [lines, setLines] = useState<ReqLine[]>(() => [emptyLine()]);
  const [aiFields, setAiFields] = useState<Record<string, boolean>>({});
  const doc = useDocumentFile(projectId, 'requisition');
  const [saving, setSaving] = useState(false);

  const [addingLine, setAddingLine] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
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
    setLines([emptyLine()]);
    setAiFields({});
    doc.selectFile(null);
  };

  const editField = (field: string, setter: (v: string) => void) => (v: string) => {
    setter(v);
    setAiFields((prev) => ({ ...prev, [field]: false }));
  };

  // Cuando llega un borrador: llena el formulario y marca lo que puso la IA. Lo que el papel no traía
  // (null) no se toca. Nunca guarda nada — el usuario revisa y confirma con "Guardar".
  useEffect(() => {
    const result = doc.draft;
    if (!result) return;
    const d = result.draft;
    const ai: Record<string, boolean> = {};
    const fill = (field: string, value: unknown, setter: (v: string) => void) => {
      if (value === null || value === undefined || value === '') return;
      setter(String(value));
      ai[field] = true;
    };
    fill('number', d.number, setFormNumber);
    fill('requisition_date', d.requisition_date, setFormDate);
    fill('requester', d.requester, setFormRequester);
    fill('notes', d.notes, setFormNotes);
    const nextLines: ReqLine[] = (d.items ?? []).map((it: any, i: number) => {
      const match = result.items.find((m) => m.index === i);
      const productId = it.product_id ?? match?.suggested_product_id ?? null;
      return {
        key: ++lineKey,
        product: productId !== null ? products.find((p) => String(p.product_id) === String(productId)) ?? null : null,
        description: it.description ?? '',
        quantity: it.quantity_requested != null ? trimNumeric(it.quantity_requested) : '',
        price: it.estimated_unit_price != null ? trimNumeric(it.estimated_unit_price) : '',
        candidates: match?.product_candidates ?? [],
        read: match?.read ?? null,
        ai: true,
      };
    });
    setLines(nextLines.length > 0 ? nextLines : [emptyLine()]);
    setAiFields(ai);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.draft]);

  const warningsFor = (field: string) => doc.draft?.warnings.filter((w) => w.field === field) ?? [];
  const flagFor = (field: string): 'ai' | 'warn' | undefined => (aiFields[field] ? (warningsFor(field).length > 0 ? 'warn' : 'ai') : undefined);
  const messageFor = (field: string) => (aiFields[field] ? warningsFor(field)[0]?.message : undefined);
  const HEADER_FIELDS = ['number', 'requisition_date', 'requester', 'notes'];
  const generalWarnings = (doc.draft?.warnings ?? []).filter((w) => !w.field || !HEADER_FIELDS.includes(w.field)).sort((a, b) => warningRank(a) - warningRank(b));

  const updateLine = (key: number, patch: Partial<ReqLine>) => setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch, ai: false } : l)));
  const searchProducts = (term: string) => {
    const t = term.trim().toLowerCase();
    return Promise.resolve(products.filter((p) => !t || p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t)).slice(0, 30));
  };

  const createRequisition = async () => {
    const items = lines
      .filter((l) => l.product && parseFloat(l.quantity) > 0)
      .map((l) => ({
        product_id: l.product!.product_id,
        description: l.description.trim() || l.product!.name,
        quantity_requested: parseFloat(l.quantity),
        estimated_unit_price: l.price.trim() ? parseFloat(l.price) : null,
      }));
    if (!formNumber.trim() || !formRequester.trim() || items.length === 0) {
      window.alert('Completá número, solicitante y al menos un material o equipo con producto y cantidad.');
      return;
    }
    setSaving(true);
    try {
      const fileId = await doc.ensureUploaded();
      await purchaseRequisitionService.createRequisition(projectId, {
        number: formNumber.trim(),
        requisition_date: formDate,
        requester: formRequester.trim(),
        notes: formNotes.trim() || null,
        items,
        file_id: fileId,
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
    setEditingHeader(false);
    setEditingLineId(null);
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
      window.alert(err instanceof Error ? err.message : 'No se pudo agregar el material o equipo.');
    } finally {
      setSavingLine(false);
    }
  };

  const saveHeader = async (patch: Record<string, string | number | null>) => {
    if (!detail) return;
    const updated = await purchaseRequisitionService.updateRequisition(projectId, detail.purchase_requisition_id, patch as any);
    setDetail(updated);
    setEditingHeader(false);
  };

  const saveLine = async (patch: Record<string, string | number | null>) => {
    if (!detail || !editingLineId) return;
    const updated = await purchaseRequisitionService.updateItem(projectId, detail.purchase_requisition_id, editingLineId, patch as any);
    setDetail(updated);
    setEditingLineId(null);
  };

  const removeLine = async (itemId: string) => {
    if (!detail) return;
    if (!window.confirm('¿Quitar este material o equipo?')) return;
    try {
      const updated = await purchaseRequisitionService.removeItem(projectId, detail.purchase_requisition_id, itemId);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar el material o equipo.');
    }
  };

  if (view === 'new') {
    const locked = doc.reading || saving;
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={() => { setView('list'); resetCreateForm(); }} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 mb-3">
          <ArrowLeft size={15} /> Volver a Requerimientos
        </button>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Nuevo requerimiento</h1>

        <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1fr)_26rem] gap-4 items-start">
          <div className={`space-y-4 ${locked ? 'pointer-events-none opacity-60' : ''}`}>
            {(generalWarnings.length > 0 || (doc.draft?.read_notes.length ?? 0) > 0) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <p className="text-xs font-semibold text-amber-700 mb-1">Revisa esto antes de guardar</p>
                <ul className="text-xs text-amber-700 list-disc pl-4 space-y-0.5">
                  {generalWarnings.map((w, i) => <li key={`w${i}`}>{w.message}</li>)}
                  {doc.draft?.read_notes.map((n, i) => <li key={`n${i}`}>{n}</li>)}
                </ul>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3">
                <Field label="Número" required value={formNumber} onChange={editField('number', setFormNumber)} placeholder="REQ-001" flag={flagFor('number')} message={messageFor('number')} />
                <Field label="Fecha" required type="date" value={formDate} onChange={editField('requisition_date', setFormDate)} flag={flagFor('requisition_date')} message={messageFor('requisition_date')} />
                <Field label="Solicitante" required value={formRequester} onChange={editField('requester', setFormRequester)} placeholder="ej. Ing. Rojas — Obra" flag={flagFor('requester')} message={messageFor('requester')} />
              </div>
              <Field label="Asunto" value={formNotes} onChange={editField('notes', setFormNotes)} placeholder="ej. Segundo tramo de columnas" className="mt-3" flag={flagFor('notes')} message={messageFor('notes')} />
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800">Materiales y equipos</p>
                <button onClick={() => setLines((prev) => [...prev, emptyLine()])} className="text-xs font-medium border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50">
                  + Material o equipo
                </button>
              </div>
              <div className="p-4 space-y-3">
                {lines.map((l) => (
                  <div key={l.key} className={`border rounded-lg p-3 ${l.ai ? 'border-violet-300 bg-violet-50/40' : 'border-gray-200 bg-gray-50/40'}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <ProductPicker
                          projectId={projectId}
                          selected={l.product}
                          onSelect={(p) => updateLine(l.key, { product: p })}
                          products={products}
                          candidates={l.candidates}
                          prefill={{ name: l.description || undefined, unit: l.read?.unit ?? undefined, code: l.read?.code ?? undefined }}
                          onCreated={(p) => setProducts((prev) => [...prev, p])}
                        />
                      </div>
                      <button
                        onClick={() => setLines((prev) => (prev.length > 1 ? prev.filter((x) => x.key !== l.key) : [emptyLine()]))}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-red-500 mt-2"
                      >
                        <X size={13} /> Quitar
                      </button>
                    </div>
                    <div className="grid grid-cols-1 @sm:grid-cols-[1fr_8rem_8rem] gap-3 mt-3">
                      <Field label="Descripción" value={l.description} onChange={(v) => updateLine(l.key, { description: v })} placeholder={l.product?.name ?? 'Como dice el documento'} />
                      <Field label={`Cantidad${l.product ? ` (${l.product.unit})` : ''}`} type="number" value={l.quantity} onChange={(v) => updateLine(l.key, { quantity: v })} />
                      <Field label="Precio estimado" type="number" value={l.price} onChange={(v) => updateLine(l.key, { price: v })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => { setView('list'); resetCreateForm(); }} className="border border-gray-200 rounded-lg px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={createRequisition} disabled={saving} className="px-6 bg-[#0056b3] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar requerimiento'}
              </button>
            </div>
          </div>

          <DocumentPanel doc={doc} disabled={saving} onRead={() => { doc.read(); }} />
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
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setEditingHeader((v) => !v)} className="border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
                Editar
              </button>
              <button onClick={removeRequisition} className="border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-50">
              Eliminar requerimiento
            </button>
            </div>
          </div>

          <div className="grid grid-cols-3 @sm:grid-cols-6 gap-2 mt-4">
            {[
              { label: 'Materiales y equipos', value: detail.summary.lines },
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

        {editingHeader && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
            <EditForm
              title="Editar requerimiento"
              fields={[
              { key: 'number', label: 'Número' },
              { key: 'requisition_date', label: 'Fecha', type: 'date' },
              { key: 'requester', label: 'Solicitante' },
              { key: 'notes', label: 'Asunto', nullable: true, span: 3 },
            ]}
              initial={{ number: detail.number, requisition_date: detail.requisition_date, requester: detail.requester, notes: detail.notes }}
              onSave={saveHeader}
              onCancel={() => setEditingHeader(false)}
            />
          </div>
        )}

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
            <p className="text-sm font-semibold text-gray-700">Materiales y equipos</p>
            <button onClick={startAddLine} className="flex items-center gap-1.5 text-xs font-semibold text-[#0056b3] hover:underline">
              <Plus size={14} /> Agregar material o equipo
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
                  <td colSpan={6} className="py-6 text-center text-gray-300">Sin materiales ni equipos</td>
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
                    <button onClick={() => setEditingLineId(item.purchase_requisition_item_id)} className="text-gray-300 hover:text-[#0056b3] mr-2" title="Editar material o equipo">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => removeLine(item.purchase_requisition_item_id)} className="text-gray-300 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {editingLineId && (() => {
            const editingLine = detail.items.find((x) => x.purchase_requisition_item_id === editingLineId);
            return editingLine ? (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <EditForm
                  key={editingLineId}
                  title="Editar material o equipo"
                  fields={[
                    { key: 'description', label: 'Descripción', span: 3 },
                    { key: 'quantity_requested', label: 'Cantidad', type: 'number' },
                    { key: 'estimated_unit_price', label: 'Precio estimado', type: 'number', nullable: true },
                  ]}
                  initial={{ description: editingLine.description, quantity_requested: editingLine.quantity_requested, estimated_unit_price: editingLine.estimated_unit_price }}
                  onSave={saveLine}
                  onCancel={() => setEditingLineId(null)}
                />
              </div>
            ) : null;
          })()}

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
          <p className="text-sm text-gray-400">Lo que se pide a la obra. Cada material o equipo es un producto real del catálogo.</p>
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
              <th className="py-2 font-medium">Materiales y equipos</th>
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
