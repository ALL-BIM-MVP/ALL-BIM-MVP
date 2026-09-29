import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { quotationService } from '../../../../services/almacen/quotation.service';
import { purchaseRequisitionService } from '../../../../services/almacen/purchaseRequisition.service';
import { projectService } from '../../../../services/project.service';
import DocumentAlerts from '../../components/DocumentAlerts';
import EditForm from '../../components/EditForm';
import DocumentPanel from '../../components/DocumentPanel';
import SearchCombobox from '../../components/SearchCombobox';
import SupplierPicker from '../../components/SupplierPicker';
import { useDocumentFile } from '../../components/useDocumentFile';
import { DraftNotices, Field, FieldFlag, flagClass, sortWarnings } from '../../components/FormField';
import {
  Currency, PurchaseRequisitionDetail, PurchaseRequisitionListItem, QuotationDetail,
  QuotationListItem, Supplier,
} from '../../../../types/almacen.types';
import { resolveMediaUrl } from '../../../../utils/media';
import { trimNumeric } from '../../../../utils/numberFormat';

interface CotizacionesProps {
  projectId: number;
}

interface LineDraft {
  checked: boolean;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  ai?: boolean; // lo llenó la IA y no se tocó
}

const Cotizaciones: React.FC<CotizacionesProps> = ({ projectId }) => {
  const [quotations, setQuotations] = useState<QuotationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [detail, setDetail] = useState<QuotationDetail | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [selectedRequisition, setSelectedRequisition] = useState<PurchaseRequisitionListItem | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [formNumber, setFormNumber] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCurrency, setFormCurrency] = useState<Currency>('PEN');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formTerms, setFormTerms] = useState('');
  const [formTotal, setFormTotal] = useState('');
  const [requisitionDetail, setRequisitionDetail] = useState<PurchaseRequisitionDetail | null>(null);
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});
  const [saving, setSaving] = useState(false);
  const [aiFields, setAiFields] = useState<Record<string, boolean>>({});
  const [lineNote, setLineNote] = useState<string | null>(null);
  const appliedLines = useRef('');
  const doc = useDocumentFile(projectId, 'quotation');

  const [addingLine, setAddingLine] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [requisitionForLines, setRequisitionForLines] = useState<PurchaseRequisitionDetail | null>(null);
  const [newLineItemId, setNewLineItemId] = useState('');
  const [newLineQuantity, setNewLineQuantity] = useState('');
  const [newLineUnitPrice, setNewLineUnitPrice] = useState('');
  const [newLineTotal, setNewLineTotal] = useState('');
  const [savingLine, setSavingLine] = useState(false);

  const loadQuotations = (term?: string) => {
    setLoading(true);
    quotationService
      .getQuotations(projectId, { search: term })
      .then(setQuotations)
      .catch(() => setQuotations([]))
      .finally(() => setLoading(false));
  };

  // Siempre trae datos frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    loadQuotations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const resetCreateForm = () => {
    setSelectedRequisition(null);
    setSelectedSupplier(null);
    setFormNumber('');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormCurrency('PEN');
    setFormValidUntil('');
    setFormTerms('');
    setFormTotal('');
    setRequisitionDetail(null);
    setLineDrafts({});
    setAiFields({});
    setLineNote(null);
    appliedLines.current = '';
    doc.selectFile(null);
  };

  const editField = (field: string, setter: (v: string) => void) => (v: string) => {
    setter(v);
    setAiFields((prev) => ({ ...prev, [field]: false }));
  };

  // Elegir el requerimiento carga sus líneas (todas marcadas: una cotización puede cubrir solo algunas,
  // se desmarcan las que no).
  const pickRequisition = async (r: PurchaseRequisitionListItem | null) => {
    setSelectedRequisition(r);
    setLineNote(null);
    appliedLines.current = '';
    if (!r) {
      setRequisitionDetail(null);
      setLineDrafts({});
      return;
    }
    try {
      const full = await purchaseRequisitionService.getRequisitionById(projectId, r.purchase_requisition_id);
      const drafts: Record<string, LineDraft> = {};
      full.items.forEach((it) => {
        drafts[it.purchase_requisition_item_id] = { checked: true, quantity: trimNumeric(it.quantity_requested), unitPrice: '', lineTotal: '' };
      });
      setLineDrafts(drafts);
      setRequisitionDetail(full);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo cargar el requerimiento.');
    }
  };

  // Borrador leído: llena el encabezado y el proveedor. Lo que el papel no traía (null) no se toca.
  // Nunca guarda nada — el usuario revisa y confirma con "Guardar".
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
    fill('quotation_date', d.quotation_date, setFormDate);
    fill('valid_until', d.valid_until, setFormValidUntil);
    fill('commercial_terms', d.commercial_terms, setFormTerms);
    fill('total_amount', d.total_amount != null ? trimNumeric(d.total_amount) : null, setFormTotal);
    if (d.currency === 'PEN' || d.currency === 'USD') { setFormCurrency(d.currency); ai.currency = true; }
    if (result.supplier.match) { setSelectedSupplier(result.supplier.match as unknown as Supplier); ai.supplier_id = true; }
    setAiFields(ai);
    appliedLines.current = '';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.draft]);

  // Líneas: cada línea leída se empareja con la línea del requerimiento del MISMO producto (una cotización
  // no cita una orden, así que el producto es el vínculo). Se aplica una sola vez por borrador+requerimiento,
  // para no pisar lo que el usuario corrija después.
  useEffect(() => {
    const result = doc.draft;
    if (!result || !requisitionDetail) return;
    const key = `${result.file_id}:${requisitionDetail.purchase_requisition_id}`;
    if (appliedLines.current === key) return;
    appliedLines.current = key;
    const readItems: any[] = result.draft.items ?? [];
    const used = new Set<number>();
    const next: Record<string, LineDraft> = {};
    requisitionDetail.items.forEach((reqItem) => {
      const idx = readItems.findIndex((it, i) => {
        if (used.has(i)) return false;
        const productId = it.product_id ?? result.items.find((m) => m.index === i)?.suggested_product_id ?? null;
        return productId !== null && String(productId) === String(reqItem.product?.product_id);
      });
      if (idx === -1) {
        next[reqItem.purchase_requisition_item_id] = { checked: false, quantity: trimNumeric(reqItem.quantity_requested), unitPrice: '', lineTotal: '' };
        return;
      }
      used.add(idx);
      const it = readItems[idx];
      next[reqItem.purchase_requisition_item_id] = {
        checked: true,
        quantity: it.quantity_quoted != null ? trimNumeric(it.quantity_quoted) : '',
        unitPrice: it.unit_price != null ? trimNumeric(it.unit_price) : '',
        lineTotal: it.line_total != null ? trimNumeric(it.line_total) : '',
        ai: true,
      };
    });
    setLineDrafts(next);
    const orphans = readItems.filter((_, i) => !used.has(i));
    setLineNote(orphans.length > 0
      ? `${orphans.length} material(es) o equipo(s) del documento no coinciden con ningún material o equipo del requerimiento elegido: ${orphans.map((o) => o.description).filter(Boolean).join('; ')}.`
      : null);
  }, [doc.draft, requisitionDetail]);

  const warningsFor = (field: string) => doc.draft?.warnings.filter((w) => w.field === field) ?? [];
  const flagFor = (field: string): FieldFlag => (aiFields[field] ? (warningsFor(field).length > 0 ? 'warn' : 'ai') : undefined);
  const messageFor = (field: string) => (aiFields[field] ? warningsFor(field)[0]?.message : undefined);
  const HEADER_FIELDS = ['number', 'quotation_date', 'valid_until', 'commercial_terms', 'total_amount', 'currency', 'supplier_id'];
  const generalWarnings = sortWarnings((doc.draft?.warnings ?? []).filter((w) => !w.field || !HEADER_FIELDS.includes(w.field)));

  const recalcLineTotal = (quantity: string, unitPrice: string) => {
    const q = parseFloat(quantity);
    const p = parseFloat(unitPrice);
    if (!isNaN(q) && !isNaN(p)) return String(Math.round(q * p * 100) / 100);
    return '';
  };

  const toggleLine = (itemId: string, checked: boolean) => {
    setLineDrafts((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] ?? { quantity: '', unitPrice: '', lineTotal: '' }), checked } }));
  };

  const setLineField = (itemId: string, field: 'quantity' | 'unitPrice' | 'lineTotal', value: string) => {
    setLineDrafts((prev) => {
      const current = prev[itemId] ?? { checked: true, quantity: '', unitPrice: '', lineTotal: '' };
      const next = { ...current, [field]: value, ai: false };
      if (field !== 'lineTotal') next.lineTotal = recalcLineTotal(next.quantity, next.unitPrice) || next.lineTotal;
      return { ...prev, [itemId]: next };
    });
  };

  const createQuotation = async () => {
    if (!selectedSupplier || !selectedRequisition || !requisitionDetail || !formNumber.trim()) {
      window.alert('Elegí proveedor, requerimiento y un número antes de guardar.');
      return;
    }
    const items = Object.entries(lineDrafts)
      .filter(([, d]) => d.checked && parseFloat(d.quantity) > 0 && d.lineTotal.trim() !== '')
      .map(([itemId, d]) => {
        const reqItem = requisitionDetail.items.find((it) => it.purchase_requisition_item_id === itemId);
        return {
          purchase_requisition_item_id: itemId,
          description: reqItem?.description ?? '',
          quantity_quoted: parseFloat(d.quantity),
          unit_price: d.unitPrice.trim() ? parseFloat(d.unitPrice) : null,
          line_total: parseFloat(d.lineTotal),
        };
      });
    if (items.length === 0) {
      window.alert('Marcá al menos un material o equipo con cantidad y total.');
      return;
    }
    setSaving(true);
    try {
      const fileId = await doc.ensureUploaded();
      await quotationService.createQuotation(projectId, {
        supplier_id: Number(selectedSupplier.supplier_id),
        purchase_requisition_id: selectedRequisition.purchase_requisition_id,
        number: formNumber.trim(),
        quotation_date: formDate,
        currency: formCurrency,
        commercial_terms: formTerms.trim() || null,
        valid_until: formValidUntil || null,
        total_amount: formTotal.trim() ? parseFloat(formTotal) : null,
        items,
        file_id: fileId,
      });
      setView('list');
      resetCreateForm();
      loadQuotations(search);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo crear la cotización.');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (id: string) => {
    quotationService
      .getQuotationById(projectId, id)
      .then((d) => {
        setDetail(d);
        setView('detail');
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : 'No se pudo abrir la cotización.'));
  };

  const backToList = () => {
    setEditingHeader(false);
    setEditingLineId(null);
    setView('list');
    setDetail(null);
    setAddingLine(false);
    loadQuotations(search);
  };

  const removeQuotation = async () => {
    if (!detail) return;
    if (!window.confirm(`¿Eliminar la cotización ${detail.number}?`)) return;
    try {
      await quotationService.deleteQuotation(projectId, detail.quotation_id);
      backToList();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar la cotización.');
    }
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file || !detail) return;
    setUploadingFile(true);
    try {
      const uploaded = await projectService.uploadFile(projectId, file, 'almacen');
      const updated = await quotationService.setFile(projectId, detail.quotation_id, uploaded.file_id);
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
      const updated = await quotationService.setFile(projectId, detail.quotation_id, null);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar el archivo.');
    }
  };

  const startAddLine = async () => {
    if (!detail) return;
    try {
      const r = await purchaseRequisitionService.getRequisitionById(projectId, detail.purchase_requisition.purchase_requisition_id);
      setRequisitionForLines(r);
      setNewLineItemId('');
      setNewLineQuantity('');
      setNewLineUnitPrice('');
      setNewLineTotal('');
      setAddingLine(true);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo cargar el requerimiento.');
    }
  };

  const availableLines = requisitionForLines?.items.filter(
    (it) => !detail?.items.some((existing) => existing.purchase_requisition_item_id === it.purchase_requisition_item_id)
  ) ?? [];

  const confirmAddLine = async () => {
    if (!detail || !newLineItemId || !newLineQuantity.trim() || !newLineTotal.trim()) return;
    const reqItem = requisitionForLines?.items.find((it) => it.purchase_requisition_item_id === newLineItemId);
    setSavingLine(true);
    try {
      const updated = await quotationService.addItem(projectId, detail.quotation_id, {
        purchase_requisition_item_id: newLineItemId,
        description: reqItem?.description ?? '',
        quantity_quoted: parseFloat(newLineQuantity),
        unit_price: newLineUnitPrice.trim() ? parseFloat(newLineUnitPrice) : null,
        line_total: parseFloat(newLineTotal),
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
    const updated = await quotationService.updateQuotation(projectId, detail.quotation_id, patch as any);
    setDetail(updated);
    setEditingHeader(false);
  };

  const saveLine = async (patch: Record<string, string | number | null>) => {
    if (!detail || !editingLineId) return;
    const updated = await quotationService.updateItem(projectId, detail.quotation_id, editingLineId, patch as any);
    setDetail(updated);
    setEditingLineId(null);
  };

  const removeLine = async (itemId: string) => {
    if (!detail) return;
    if (!window.confirm('¿Quitar este material o equipo?')) return;
    try {
      const updated = await quotationService.removeItem(projectId, detail.quotation_id, itemId);
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
          <ArrowLeft size={15} /> Volver a Cotizaciones
        </button>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Nueva cotización</h1>

        <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1fr)_26rem] gap-4 items-start">
          <div className={`space-y-4 ${locked ? 'pointer-events-none opacity-60' : ''}`}>
            <DraftNotices warnings={generalWarnings} readNotes={doc.draft?.read_notes ?? []} />

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-[11px] text-gray-500 font-medium">Proveedor<span className="text-red-500"> *</span></span>
                  <SupplierPicker
                    projectId={projectId}
                    selected={selectedSupplier}
                    onSelect={(s) => { setSelectedSupplier(s); setAiFields((p) => ({ ...p, supplier_id: false })); }}
                    flag={flagFor('supplier_id')}
                    message={messageFor('supplier_id')}
                    offer={doc.draft?.supplier.to_create ?? null}
                  />
                </div>
                <div>
                  <span className="text-[11px] text-gray-500 font-medium">Requerimiento<span className="text-red-500"> *</span></span>
                  <SearchCombobox<PurchaseRequisitionListItem>
                    selected={selectedRequisition}
                    onSelect={pickRequisition}
                    search={(term) => purchaseRequisitionService.getRequisitions(projectId, term || undefined)}
                    getId={(r) => r.purchase_requisition_id}
                    getLabel={(r) => `${r.number} — ${r.requester}`}
                    placeholder="Buscar por número o solicitante…"
                  />
                  {!selectedRequisition && (
                    <p className="mt-1.5 inline-block text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">Sin vincular: busca y elige un registro de la lista.</p>
                  )}
                </div>
                <Field label="Número" required value={formNumber} onChange={editField('number', setFormNumber)} placeholder="COT-2026-001" flag={flagFor('number')} message={messageFor('number')} />
                <Field label="Fecha" required type="date" value={formDate} onChange={editField('quotation_date', setFormDate)} flag={flagFor('quotation_date')} message={messageFor('quotation_date')} />
                <label className="block">
                  <span className="text-[11px] text-gray-500 font-medium">Moneda<span className="text-red-500"> *</span></span>
                  <select
                    value={formCurrency}
                    onChange={(e) => { setFormCurrency(e.target.value as Currency); setAiFields((p) => ({ ...p, currency: false })); }}
                    className={`w-full mt-1 px-2.5 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] ${flagClass(flagFor('currency'))}`}
                  >
                    <option value="PEN">Soles (PEN)</option>
                    <option value="USD">Dólares (USD)</option>
                  </select>
                </label>
                <Field label="Válida hasta" type="date" value={formValidUntil} onChange={editField('valid_until', setFormValidUntil)} flag={flagFor('valid_until')} message={messageFor('valid_until')} />
                <Field label="Total declarado" type="number" value={formTotal} onChange={editField('total_amount', setFormTotal)} flag={flagFor('total_amount')} message={messageFor('total_amount')} />
                <Field label="Condiciones" value={formTerms} onChange={editField('commercial_terms', setFormTerms)} className="@sm:col-span-2" flag={flagFor('commercial_terms')} message={messageFor('commercial_terms')} />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800">Materiales y equipos</p>
              </div>
              <div className="p-4 space-y-3">
                {lineNote && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{lineNote}</p>}
                {!requisitionDetail ? (
                  <div className="border border-dashed border-gray-300 rounded-lg py-8 text-center text-sm text-gray-400">Elige el origen para cargar sus materiales y equipos.</div>
                ) : (
                  requisitionDetail.items.map((it) => {
                    const d = lineDrafts[it.purchase_requisition_item_id];
                    return (
                      <div key={it.purchase_requisition_item_id} className={`border rounded-lg p-3 ${d?.ai ? 'border-violet-300 bg-violet-50/40' : 'border-gray-200 bg-gray-50/40'}`}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={d?.checked ?? false}
                            onChange={(e) => toggleLine(it.purchase_requisition_item_id, e.target.checked)}
                            className="accent-[#0056b3]"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{it.product ? `${it.product.code} — ${it.product.name}` : it.description}</p>
                            <p className="text-xs text-gray-400">Solicitado: {trimNumeric(it.quantity_requested)} {it.product?.unit ?? ''}</p>
                          </div>
                        </div>
                        {d?.checked && (
                          <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3 mt-3 pl-7">
                            <Field label="Cantidad cotizada" type="number" value={d.quantity} onChange={(v) => setLineField(it.purchase_requisition_item_id, 'quantity', v)} />
                            <Field label="Precio unit." type="number" value={d.unitPrice} onChange={(v) => setLineField(it.purchase_requisition_item_id, 'unitPrice', v)} />
                            <Field label="Total" type="number" value={d.lineTotal} onChange={(v) => setLineField(it.purchase_requisition_item_id, 'lineTotal', v)} />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => { setView('list'); resetCreateForm(); }} className="border border-gray-200 rounded-lg px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={createQuotation} disabled={saving} className="px-6 bg-[#0056b3] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar cotización'}
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
          <ArrowLeft size={15} /> Volver a Cotizaciones
        </button>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{detail.number} — {detail.supplier.name}</h1>
              <p className="text-sm text-gray-400 mt-0.5">
                Requerimiento {detail.purchase_requisition.number} · {detail.quotation_date} · {detail.currency}
              </p>
              {detail.commercial_terms && <p className="text-sm text-gray-600 mt-2">{detail.commercial_terms}</p>}
              {detail.valid_until && <p className="text-xs text-gray-400 mt-1">Válida hasta {detail.valid_until}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setEditingHeader((v) => !v)} className="border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
                Editar
              </button>
              <button onClick={removeQuotation} className="border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-50">
              Eliminar cotización
            </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Total del documento</p>
              <p className="text-lg font-bold text-gray-800">{detail.total_amount != null ? trimNumeric(detail.total_amount) : '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Suma de materiales y equipos</p>
              <p className="text-lg font-bold text-gray-800">{trimNumeric(detail.lines_total)}</p>
            </div>
          </div>
          {detail.total_amount !== null && detail.total_amount !== detail.lines_total && (
            <p className="text-xs text-amber-600 mt-2">⚠ El total del documento no coincide con la suma de los materiales y equipos.</p>
          )}
        </div>

        {editingHeader && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
            <EditForm
              title="Editar cotización"
              fields={[
              { key: 'number', label: 'Número' },
              { key: 'quotation_date', label: 'Fecha', type: 'date' },
              { key: 'currency', label: 'Moneda', type: 'select', options: [['PEN', 'Soles (PEN)'], ['USD', 'Dólares (USD)']] },
              { key: 'valid_until', label: 'Válida hasta', type: 'date', nullable: true },
              { key: 'total_amount', label: 'Total declarado', type: 'number', nullable: true },
              { key: 'commercial_terms', label: 'Condiciones', nullable: true, span: 3 },
            ]}
              initial={{ number: detail.number, quotation_date: detail.quotation_date, currency: detail.currency, valid_until: detail.valid_until, total_amount: detail.total_amount, commercial_terms: detail.commercial_terms }}
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
                <th className="py-2 font-medium">Cant. cotizada</th>
                <th className="py-2 font-medium">Precio unit.</th>
                <th className="py-2 font-medium">Total</th>
                <th className="py-2 font-medium">Estado</th>
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
                <tr key={item.quotation_item_id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-800">{item.product ? `${item.product.code} — ${item.product.name}` : item.description}</td>
                  <td className="py-2 text-gray-700">{trimNumeric(item.quantity_quoted)} {item.product?.unit ?? ''}</td>
                  <td className="py-2 text-gray-500">{item.unit_price != null ? trimNumeric(item.unit_price) : '—'}</td>
                  <td className="py-2 font-semibold text-gray-800">{trimNumeric(item.line_total)}</td>
                  <td className="py-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      {item.progress.awarded ? (
                        <span className="text-green-600 font-medium">Adjudicada</span>
                      ) : (
                        <span className="text-gray-400">Sin adjudicar</span>
                      )}
                      {item.alerts.length > 0 && (
                        <span title={item.alerts.map((a) => a.message).join(' — ')}>
                          <TriangleAlert size={13} className="text-amber-500 flex-shrink-0" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => setEditingLineId(item.quotation_item_id)} className="text-gray-300 hover:text-[#0056b3] mr-2" title="Editar material o equipo">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => removeLine(item.quotation_item_id)} className="text-gray-300 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {editingLineId && (() => {
            const editingLine = detail.items.find((x) => x.quotation_item_id === editingLineId);
            return editingLine ? (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <EditForm
                  key={editingLineId}
                  title="Editar material o equipo"
                  fields={[
                    { key: 'description', label: 'Descripción', span: 3 },
                    { key: 'quantity_quoted', label: 'Cantidad cotizada', type: 'number' },
                    { key: 'unit_price', label: 'Precio unit.', type: 'number', nullable: true },
                    { key: 'line_total', label: 'Total', type: 'number' },
                    { key: 'notes', label: 'Observaciones', nullable: true, span: 3 },
                  ]}
                  initial={{ description: editingLine.description, quantity_quoted: editingLine.quantity_quoted, unit_price: editingLine.unit_price, line_total: editingLine.line_total, notes: editingLine.notes }}
                  onSave={saveLine}
                  onCancel={() => setEditingLineId(null)}
                />
              </div>
            ) : null;
          })()}

          {addingLine && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 @sm:grid-cols-4 gap-3">
              <label className="block">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Material o equipo del requerimiento</span>
                <select
                  value={newLineItemId}
                  onChange={(e) => setNewLineItemId(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                >
                  <option value="">Elegir...</option>
                  {availableLines.map((it) => (
                    <option key={it.purchase_requisition_item_id} value={it.purchase_requisition_item_id}>
                      {it.product ? `${it.product.code} — ${it.product.name}` : it.description}
                    </option>
                  ))}
                </select>
              </label>
              <Field label="Cantidad cotizada" type="number" value={newLineQuantity} onChange={(v) => { setNewLineQuantity(v); setNewLineTotal(recalcLineTotal(v, newLineUnitPrice) || newLineTotal); }} />
              <Field label="Precio unit. (opcional)" type="number" value={newLineUnitPrice} onChange={(v) => { setNewLineUnitPrice(v); setNewLineTotal(recalcLineTotal(newLineQuantity, v) || newLineTotal); }} />
              <Field label="Total" type="number" value={newLineTotal} onChange={setNewLineTotal} />
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
          <h1 className="text-2xl font-bold text-gray-800">Cotizaciones</h1>
          <p className="text-sm text-gray-400">Una cotización puede cubrir solo algunos materiales o equipos de un requerimiento.</p>
        </div>
        <button
          onClick={() => { resetCreateForm(); setView('new'); }}
          className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors"
        >
          <Plus size={15} /> Nueva cotización
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <label className="block mb-3">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Buscar</span>
          <div className="flex gap-2 mt-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Por código, proveedor o requerimiento..."
              className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            />
            <button
              onClick={() => loadQuotations(search)}
              className="border border-gray-200 rounded-lg px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Filtrar
            </button>
          </div>
        </label>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 font-medium">Código</th>
              <th className="py-2 font-medium">Proveedor</th>
              <th className="py-2 font-medium">Requerimiento</th>
              <th className="py-2 font-medium">Materiales y equipos</th>
              <th className="py-2 font-medium">Monto ref.</th>
              <th className="py-2 font-medium">Fecha</th>
              <th className="py-2 font-medium">Archivo</th>
            </tr>
          </thead>
          <tbody>
            {!loading && quotations.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-300">Todavía no hay documentos.</td>
              </tr>
            )}
            {quotations.map((q) => (
              <tr key={q.quotation_id} onClick={() => openDetail(q.quotation_id)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50">
                <td className="py-2 font-mono text-xs text-gray-700">{q.number}</td>
                <td className="py-2 text-gray-800">{q.supplier.name}</td>
                <td className="py-2 text-[#0056b3] font-medium">{q.purchase_requisition.number}</td>
                <td className="py-2 text-gray-500">{q.items_count}</td>
                <td className="py-2 text-gray-500">{q.currency} {trimNumeric(q.total_amount ?? q.lines_total)}</td>
                <td className="py-2 text-gray-500">{q.quotation_date}</td>
                <td className="py-2">
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${q.has_file ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                    {q.has_file ? 'Archivo' : 'Archivo pendiente'}
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

export default Cotizaciones;
