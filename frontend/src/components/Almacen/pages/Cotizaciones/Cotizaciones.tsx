import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { quotationService } from '../../../../services/almacen/quotation.service';
import { purchaseRequisitionService } from '../../../../services/almacen/purchaseRequisition.service';
import { supplierService } from '../../../../services/almacen/supplier.service';
import { projectService } from '../../../../services/project.service';
import DocumentAlerts from '../../components/DocumentAlerts';
import SearchCombobox from '../../components/SearchCombobox';
import {
  Currency, PurchaseRequisitionDetail, PurchaseRequisitionListItem, QuotationDetail,
  QuotationListItem, Supplier,
} from '../../../../types/almacen.types';
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

interface CotizacionesProps {
  projectId: number;
}

interface LineDraft {
  checked: boolean;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

const Cotizaciones: React.FC<CotizacionesProps> = ({ projectId }) => {
  const [quotations, setQuotations] = useState<QuotationListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [detail, setDetail] = useState<QuotationDetail | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [formRequisitionId, setFormRequisitionId] = useState('');
  const [selectedRequisition, setSelectedRequisition] = useState<PurchaseRequisitionListItem | null>(null);
  const [formSupplierId, setFormSupplierId] = useState<number | ''>('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [showCreateSupplier, setShowCreateSupplier] = useState(false);
  const [newSupplierRuc, setNewSupplierRuc] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [formNumber, setFormNumber] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCurrency, setFormCurrency] = useState<Currency>('PEN');
  const [formValidUntil, setFormValidUntil] = useState('');
  const [formTerms, setFormTerms] = useState('');
  const [formTotal, setFormTotal] = useState('');
  const [requisitionDetail, setRequisitionDetail] = useState<PurchaseRequisitionDetail | null>(null);
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});
  const [saving, setSaving] = useState(false);

  const [addingLine, setAddingLine] = useState(false);
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
    setCreateStep(1);
    setFormRequisitionId('');
    setSelectedRequisition(null);
    setFormSupplierId('');
    setSelectedSupplier(null);
    setFormNumber('');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormCurrency('PEN');
    setFormValidUntil('');
    setFormTerms('');
    setFormTotal('');
    setRequisitionDetail(null);
    setLineDrafts({});
  };

  const createSupplierInline = async () => {
    if (!newSupplierRuc.trim() || !newSupplierName.trim()) return;
    setCreatingSupplier(true);
    try {
      const created = await supplierService.createSupplier(projectId, { ruc: newSupplierRuc.trim(), name: newSupplierName.trim() });
      setFormSupplierId(created.supplier_id);
      setSelectedSupplier(created);
      setShowCreateSupplier(false);
      setNewSupplierRuc('');
      setNewSupplierName('');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo crear el proveedor.');
    } finally {
      setCreatingSupplier(false);
    }
  };

  const goToLines = async () => {
    if (!formRequisitionId || !formSupplierId || !formNumber.trim()) {
      window.alert('Elegí requerimiento, proveedor y un número antes de continuar.');
      return;
    }
    try {
      const r = await purchaseRequisitionService.getRequisitionById(projectId, formRequisitionId);
      setRequisitionDetail(r);
      setLineDrafts({});
      setCreateStep(2);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo cargar el requerimiento.');
    }
  };

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
      const next = { ...current, [field]: value };
      if (field !== 'lineTotal') next.lineTotal = recalcLineTotal(next.quantity, next.unitPrice) || next.lineTotal;
      return { ...prev, [itemId]: next };
    });
  };

  const createQuotation = async () => {
    if (!requisitionDetail || !formSupplierId) return;
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
      window.alert('Marcá al menos una línea con cantidad y total.');
      return;
    }
    setSaving(true);
    try {
      await quotationService.createQuotation(projectId, {
        supplier_id: Number(formSupplierId),
        purchase_requisition_id: formRequisitionId,
        number: formNumber.trim(),
        quotation_date: formDate,
        currency: formCurrency,
        commercial_terms: formTerms.trim() || null,
        valid_until: formValidUntil || null,
        total_amount: formTotal.trim() ? parseFloat(formTotal) : null,
        items,
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
      window.alert(err instanceof Error ? err.message : 'No se pudo agregar la línea.');
    } finally {
      setSavingLine(false);
    }
  };

  const removeLine = async (itemId: string) => {
    if (!detail) return;
    if (!window.confirm('¿Quitar esta línea?')) return;
    try {
      const updated = await quotationService.removeItem(projectId, detail.quotation_id, itemId);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar la línea.');
    }
  };

  if (view === 'new') {
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={() => { setView('list'); resetCreateForm(); }} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 mb-3">
          <ArrowLeft size={15} /> Volver a Cotizaciones
        </button>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Nueva cotización</h1>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          {createStep === 1 ? (
            <>
              <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3 mb-3">
                <label className="block">
                  <span className="text-[11px] text-gray-400 uppercase tracking-wide">Requerimiento al que responde</span>
                  <SearchCombobox<PurchaseRequisitionListItem>
                    selected={selectedRequisition}
                    onSelect={(r) => { setSelectedRequisition(r); setFormRequisitionId(r?.purchase_requisition_id ?? ''); }}
                    search={(term) => purchaseRequisitionService.getRequisitions(projectId, term || undefined)}
                    getId={(r) => r.purchase_requisition_id}
                    getLabel={(r) => `${r.number} — ${r.requester}`}
                    placeholder="Buscar por número o solicitante..."
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-400 uppercase tracking-wide">Proveedor</span>
                  <SearchCombobox<Supplier>
                    selected={selectedSupplier}
                    onSelect={(s) => { setSelectedSupplier(s); setFormSupplierId(s?.supplier_id ?? ''); }}
                    search={(term) => supplierService.getSuppliers(projectId, term || undefined)}
                    getId={(s) => s.supplier_id}
                    getLabel={(s) => s.name}
                    getSubLabel={(s) => s.ruc}
                    placeholder="Buscar por nombre o RUC..."
                    footer={(
                      <button
                        type="button"
                        onClick={() => { setShowCreateSupplier(true); setNewSupplierRuc(''); setNewSupplierName(''); }}
                        className="text-xs font-medium text-[#0056b3] hover:underline"
                      >
                        + Crear proveedor
                      </button>
                    )}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 @sm:grid-cols-4 gap-3 mb-3">
                <Field label="Número" value={formNumber} onChange={setFormNumber} placeholder="ej. COT-001" />
                <Field label="Fecha" type="date" value={formDate} onChange={setFormDate} />
                <label className="block">
                  <span className="text-[11px] text-gray-400 uppercase tracking-wide">Moneda</span>
                  <select
                    value={formCurrency}
                    onChange={(e) => setFormCurrency(e.target.value as Currency)}
                    className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                  >
                    <option value="PEN">PEN</option>
                    <option value="USD">USD</option>
                  </select>
                </label>
                <Field label="Válida hasta (opcional)" type="date" value={formValidUntil} onChange={setFormValidUntil} />
              </div>
              <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3 mb-5">
                <Field label="Condiciones (opcional)" value={formTerms} onChange={setFormTerms} />
                <Field label="Total del documento (opcional)" type="number" value={formTotal} onChange={setFormTotal} />
              </div>

              <div className="flex justify-end">
                <button onClick={goToLines} className="px-8 bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors">
                  Continuar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-2">Líneas del requerimiento {requisitionDetail?.number}</p>
              <div className="grid grid-cols-1 @lg:grid-cols-2 gap-2 mb-5">
                {requisitionDetail?.items.map((it) => (
                  <div key={it.purchase_requisition_item_id} className="border border-gray-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3 mb-2">
                      <input
                        type="checkbox"
                        checked={lineDrafts[it.purchase_requisition_item_id]?.checked ?? false}
                        onChange={(e) => toggleLine(it.purchase_requisition_item_id, e.target.checked)}
                        className="accent-[#0056b3]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {it.product ? `${it.product.code} — ${it.product.name}` : it.description}
                        </p>
                        <p className="text-xs text-gray-400">Solicitado: {trimNumeric(it.quantity_requested)} {it.product?.unit ?? ''}</p>
                      </div>
                    </div>
                    {lineDrafts[it.purchase_requisition_item_id]?.checked && (
                      <div className="grid grid-cols-3 gap-2 pl-7">
                        <input
                          type="number"
                          placeholder="Cantidad"
                          value={lineDrafts[it.purchase_requisition_item_id]?.quantity ?? ''}
                          onChange={(e) => setLineField(it.purchase_requisition_item_id, 'quantity', e.target.value)}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                        />
                        <input
                          type="number"
                          placeholder="Precio unit."
                          value={lineDrafts[it.purchase_requisition_item_id]?.unitPrice ?? ''}
                          onChange={(e) => setLineField(it.purchase_requisition_item_id, 'unitPrice', e.target.value)}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                        />
                        <input
                          type="number"
                          placeholder="Total línea"
                          value={lineDrafts[it.purchase_requisition_item_id]?.lineTotal ?? ''}
                          onChange={(e) => setLineField(it.purchase_requisition_item_id, 'lineTotal', e.target.value)}
                          className="px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setCreateStep(1)} className="border border-gray-200 rounded-lg px-6 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                  ← Volver
                </button>
                <button onClick={createQuotation} disabled={saving} className="px-8 bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50">
                  {saving ? 'Creando...' : 'Crear cotización'}
                </button>
              </div>
            </>
          )}
        </div>

        {showCreateSupplier && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-gray-800 mb-4">Nuevo proveedor</h3>
              <Field label="RUC (11 dígitos)" value={newSupplierRuc} onChange={setNewSupplierRuc} placeholder="20456789123" className="mb-3" />
              <Field label="Nombre" value={newSupplierName} onChange={setNewSupplierName} placeholder="ej. Ferretería XYZ" className="mb-4" />
              <div className="flex gap-2">
                <button onClick={() => setShowCreateSupplier(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={createSupplierInline} disabled={creatingSupplier} className="flex-1 bg-[#0056b3] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[#004494] disabled:opacity-50">
                  {creatingSupplier ? 'Creando...' : 'Crear proveedor'}
                </button>
              </div>
            </div>
          </div>
        )}
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
            <button onClick={removeQuotation} className="flex-shrink-0 border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-50">
              Eliminar cotización
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Total del documento</p>
              <p className="text-lg font-bold text-gray-800">{detail.total_amount != null ? trimNumeric(detail.total_amount) : '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Suma de líneas</p>
              <p className="text-lg font-bold text-gray-800">{trimNumeric(detail.lines_total)}</p>
            </div>
          </div>
          {detail.total_amount !== null && detail.total_amount !== detail.lines_total && (
            <p className="text-xs text-amber-600 mt-2">⚠ El total del documento no coincide con la suma de las líneas.</p>
          )}
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
                <th className="py-2 font-medium">Cant. cotizada</th>
                <th className="py-2 font-medium">Precio unit.</th>
                <th className="py-2 font-medium">Total línea</th>
                <th className="py-2 font-medium">Estado</th>
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
                    <button onClick={() => removeLine(item.quotation_item_id)} className="text-gray-300 hover:text-red-500">
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
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Línea del requerimiento</span>
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
              <Field label="Total línea" type="number" value={newLineTotal} onChange={setNewLineTotal} />
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
          <p className="text-sm text-gray-400">Una cotización puede cubrir solo algunas líneas de un requerimiento.</p>
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
              <th className="py-2 font-medium">Líneas</th>
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
