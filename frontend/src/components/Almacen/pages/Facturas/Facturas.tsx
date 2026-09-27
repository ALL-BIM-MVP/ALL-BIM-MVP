import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { invoiceService } from '../../../../services/almacen/invoice.service';
import { purchaseOrderService } from '../../../../services/almacen/purchaseOrder.service';
import { productService } from '../../../../services/almacen/product.service';
import { projectService } from '../../../../services/project.service';
import DocumentAlerts from '../../components/DocumentAlerts';
import EditForm from '../../components/EditForm';
import DocumentPanel from '../../components/DocumentPanel';
import ProductPicker from '../../components/ProductPicker';
import SearchCombobox from '../../components/SearchCombobox';
import SupplierPicker from '../../components/SupplierPicker';
import { useDocumentFile } from '../../components/useDocumentFile';
import { DraftNotices, Field, FieldFlag, flagClass, sortWarnings } from '../../components/FormField';
import {
  Currency, DraftItemMatch, DraftProductCandidate, InvoiceDetail, InvoiceListItem, Product, PurchaseOrderDetail, PurchaseOrderListItem, Supplier,
} from '../../../../types/almacen.types';
import { resolveMediaUrl } from '../../../../utils/media';
import { trimNumeric } from '../../../../utils/numberFormat';

interface FacturasProps {
  projectId: number;
}

// Una línea del formulario de creación. Con orden nace de una línea de la orden (sourceId) y solo se marca
// o ajusta; sin orden (factura directa) el usuario elige el producto del catálogo.
interface InvLine {
  key: number;
  sourceId: string | null;
  productId: string | null; // producto de la línea de la orden — para emparejar con lo que leyó la IA
  label: string;
  product: Product | null; // solo factura directa
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  checked: boolean;
  ai: boolean;
  candidates: DraftProductCandidate[];
  read?: DraftItemMatch['read'] | null; // lo que dijo el papel en esa línea (código, unidad)
}

let lineKey = 0;
const emptyLine = (): InvLine => ({
  key: ++lineKey, sourceId: null, productId: null, label: '', product: null, description: '',
  quantity: '', unitPrice: '', lineTotal: '', checked: true, ai: false, candidates: [],
});

const Facturas: React.FC<FacturasProps> = ({ projectId }) => {
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [products, setProducts] = useState<Product[]>([]);

  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [formSeries, setFormSeries] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCurrency, setFormCurrency] = useState<Currency>('PEN');
  const [formSubtotal, setFormSubtotal] = useState('');
  const [formTax, setFormTax] = useState('');
  const [formTotal, setFormTotal] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderListItem | null>(null);
  const [orderDetail, setOrderDetail] = useState<PurchaseOrderDetail | null>(null);
  const [lines, setLines] = useState<InvLine[]>(() => [emptyLine()]);
  const [aiFields, setAiFields] = useState<Record<string, boolean>>({});
  const [lineNote, setLineNote] = useState<string | null>(null);
  const appliedLines = useRef('');
  const doc = useDocumentFile(projectId, 'invoice');

  const [addingLine, setAddingLine] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [newLineProductId, setNewLineProductId] = useState<number | ''>('');
  const [newLineDescription, setNewLineDescription] = useState('');
  const [newLineQuantity, setNewLineQuantity] = useState('');
  const [newLineUnitPrice, setNewLineUnitPrice] = useState('');
  const [newLineTotal, setNewLineTotal] = useState('');
  const [savingLine, setSavingLine] = useState(false);

  const loadInvoices = (term?: string) => {
    setLoading(true);
    invoiceService
      .getInvoices(projectId, { search: term })
      .then(setInvoices)
      .catch(() => setInvoices([]))
      .finally(() => setLoading(false));
  };

  // Siempre trae datos frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    loadInvoices();
    productService.getProducts(projectId).then(setProducts).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const resetCreateForm = () => {
    setFormSeries('');
    setFormNumber('');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormCurrency('PEN');
    setFormSubtotal('');
    setFormTax('');
    setFormTotal('');
    setSelectedOrder(null);
    setOrderDetail(null);
    setSelectedSupplier(null);
    setLines([emptyLine()]);
    setAiFields({});
    setLineNote(null);
    appliedLines.current = '';
    doc.selectFile(null);
  };

  const editField = (field: string, setter: (v: string) => void) => (v: string) => {
    setter(v);
    setAiFields((prev) => ({ ...prev, [field]: false }));
  };

  const recalcTotal = (quantity: string, unitPrice: string) => {
    const q = parseFloat(quantity);
    const p = parseFloat(unitPrice);
    if (!isNaN(q) && !isNaN(p)) return String(Math.round(q * p * 100) / 100);
    return '';
  };

  // Con orden: el proveedor es el de la orden y se cargan TODAS sus líneas tal como se ordenaron — se
  // desmarcan o ajustan antes de facturar (puede ser parcial). Sin orden: factura directa.
  const loadOrder = async (orderId: string | null) => {
    setLineNote(null);
    appliedLines.current = '';
    if (!orderId) {
      setSelectedOrder(null);
      setOrderDetail(null);
      setLines([emptyLine()]);
      return;
    }
    try {
      const full = await purchaseOrderService.getOrderById(projectId, orderId);
      setSelectedOrder(full);
      setSelectedSupplier(full.supplier as unknown as Supplier);
      setLines(full.items.map((it) => ({
        ...emptyLine(),
        sourceId: it.purchase_order_item_id,
        productId: it.product ? String(it.product.product_id) : null,
        label: it.product ? `${it.product.code} — ${it.product.name}` : it.description,
        description: it.description,
        quantity: trimNumeric(it.quantity_ordered),
        unitPrice: it.unit_price != null ? trimNumeric(it.unit_price) : '',
        lineTotal: trimNumeric(it.line_total),
        checked: true,
      })));
      setOrderDetail(full);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo cargar la orden.');
    }
  };

  const supplierLocked = selectedOrder !== null;

  // Borrador leído: llena el encabezado y el proveedor; si el papel cita una orden que existe, la selecciona y
  // carga sus líneas de una (no hay que buscarla a mano). Sin orden, arma las líneas desde lo leído.
  // Lo que el papel no traía (null) no se toca. Nunca guarda nada.
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
    fill('series', d.series, setFormSeries);
    fill('number', d.number, setFormNumber);
    fill('invoice_date', d.invoice_date, setFormDate);
    fill('subtotal_amount', d.subtotal_amount != null ? trimNumeric(d.subtotal_amount) : null, setFormSubtotal);
    fill('tax_amount', d.tax_amount != null ? trimNumeric(d.tax_amount) : null, setFormTax);
    fill('total_amount', d.total_amount != null ? trimNumeric(d.total_amount) : null, setFormTotal);
    if (d.currency === 'PEN' || d.currency === 'USD') { setFormCurrency(d.currency); ai.currency = true; }
    if (result.supplier.match && !supplierLocked) { setSelectedSupplier(result.supplier.match as unknown as Supplier); ai.supplier_id = true; }
    setAiFields(ai);
    appliedLines.current = '';

    const orderMatch = result.purchase_order.match;
    if (orderMatch && !selectedOrder) {
      loadOrder(orderMatch.purchase_order_id);
    } else if (!selectedOrder) {
      const next: InvLine[] = (d.items ?? []).map((it: any, i: number) => {
        const match = result.items.find((m) => m.index === i);
        const productId = it.product_id ?? match?.suggested_product_id ?? null;
        const qty = it.quantity_invoiced != null ? trimNumeric(it.quantity_invoiced) : '';
        const price = it.unit_price != null ? trimNumeric(it.unit_price) : '';
        return {
          ...emptyLine(),
          product: productId !== null ? products.find((p) => String(p.product_id) === String(productId)) ?? null : null,
          description: it.description ?? '',
          quantity: qty,
          unitPrice: price,
          lineTotal: it.line_total != null ? trimNumeric(it.line_total) : recalcTotal(qty, price),
          candidates: match?.product_candidates ?? [],
        read: match?.read ?? null,
          ai: true,
        };
      });
      setLines(next.length > 0 ? next : [emptyLine()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.draft]);

  // Con orden: cada línea leída se empareja con la línea de la orden que la IA ya calculó
  // (order_item_candidate); si no hubo, con la del MISMO producto. Una sola vez por borrador+orden,
  // para no pisar lo que el usuario corrija después.
  useEffect(() => {
    const result = doc.draft;
    if (!result || !orderDetail) return;
    const key = `${result.file_id}:${orderDetail.purchase_order_id}`;
    if (appliedLines.current === key) return;
    appliedLines.current = key;
    const readItems: any[] = result.draft.items ?? [];
    const used = new Set<number>();
    setLines((prev) => prev.map((l) => {
      const idx = readItems.findIndex((it, i) => {
        if (used.has(i)) return false;
        const cited = it.purchase_order_item_id ?? result.items.find((m) => m.index === i)?.order_item_candidate?.purchase_order_item_id ?? null;
        if (cited !== null) return String(cited) === l.sourceId;
        const productId = it.product_id ?? result.items.find((m) => m.index === i)?.suggested_product_id ?? null;
        return productId !== null && l.productId !== null && String(productId) === l.productId;
      });
      if (idx === -1) return { ...l, checked: false, ai: false };
      used.add(idx);
      const it = readItems[idx];
      const qty = it.quantity_invoiced != null ? trimNumeric(it.quantity_invoiced) : l.quantity;
      const price = it.unit_price != null ? trimNumeric(it.unit_price) : l.unitPrice;
      return { ...l, checked: true, ai: true, quantity: qty, unitPrice: price, lineTotal: it.line_total != null ? trimNumeric(it.line_total) : recalcTotal(qty, price) || l.lineTotal };
    }));
    const orphans = readItems.filter((_, i) => !used.has(i));
    setLineNote(orphans.length > 0
      ? `${orphans.length} línea(s) del documento no coinciden con ninguna línea de la orden elegida: ${orphans.map((o) => o.description).filter(Boolean).join('; ')}.`
      : null);
  }, [doc.draft, orderDetail]);

  const warningsFor = (field: string) => doc.draft?.warnings.filter((w) => w.field === field) ?? [];
  const flagFor = (field: string): FieldFlag => (aiFields[field] ? (warningsFor(field).length > 0 ? 'warn' : 'ai') : undefined);
  const messageFor = (field: string) => (aiFields[field] ? warningsFor(field)[0]?.message : undefined);
  const HEADER_FIELDS = ['series', 'number', 'invoice_date', 'subtotal_amount', 'tax_amount', 'total_amount', 'currency', 'supplier_id'];
  const generalWarnings = sortWarnings((doc.draft?.warnings ?? []).filter((w) => !w.field || !HEADER_FIELDS.includes(w.field)));

  const updateLine = (key: number, patch: Partial<InvLine>) => setLines((prev) => prev.map((l) => {
    if (l.key !== key) return l;
    const next = { ...l, ...patch, ai: false };
    if (('quantity' in patch || 'unitPrice' in patch) && !('lineTotal' in patch)) next.lineTotal = recalcTotal(next.quantity, next.unitPrice) || next.lineTotal;
    return next;
  }));
  const searchProducts = (term: string) => {
    const t = term.trim().toLowerCase();
    return Promise.resolve(products.filter((p) => !t || p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t)).slice(0, 30));
  };

  const createInvoice = async () => {
    if (!selectedSupplier || !formSeries.trim() || !formNumber.trim()) {
      window.alert('Completá el proveedor, la serie y el número de la factura.');
      return;
    }
    const items = lines
      .filter((l) => l.checked && (l.sourceId !== null || l.product) && parseFloat(l.quantity) > 0 && l.lineTotal.trim() !== '')
      .map((l) => ({
        ...(l.sourceId !== null ? { purchase_order_item_id: l.sourceId } : { product_id: l.product!.product_id }),
        description: l.description.trim() || l.product?.name || l.label,
        quantity_invoiced: parseFloat(l.quantity),
        unit_price: l.unitPrice.trim() ? parseFloat(l.unitPrice) : null,
        line_total: parseFloat(l.lineTotal),
      }));
    if (items.length === 0) {
      window.alert('Marcá al menos una línea con cantidad y total.');
      return;
    }

    setSaving(true);
    try {
      const fileId = await doc.ensureUploaded();
      await invoiceService.createInvoice(projectId, {
        supplier_id: Number(selectedSupplier.supplier_id),
        purchase_order_id: selectedOrder ? selectedOrder.purchase_order_id : null,
        series: formSeries.trim(),
        number: formNumber.trim(),
        invoice_date: formDate,
        currency: formCurrency,
        subtotal_amount: formSubtotal.trim() ? parseFloat(formSubtotal) : null,
        tax_amount: formTax.trim() ? parseFloat(formTax) : null,
        total_amount: formTotal.trim() ? parseFloat(formTotal) : null,
        items,
        file_id: fileId,
      });
      setView('list');
      resetCreateForm();
      loadInvoices(search);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo crear la factura.');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (id: string) => {
    invoiceService
      .getInvoiceById(projectId, id)
      .then((d) => {
        setDetail(d);
        setView('detail');
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : 'No se pudo abrir la factura.'));
  };

  const backToList = () => {
    setEditingHeader(false);
    setEditingLineId(null);
    setView('list');
    setDetail(null);
    setAddingLine(false);
    loadInvoices(search);
  };

  const removeInvoice = async () => {
    if (!detail) return;
    if (!window.confirm(`¿Eliminar la factura ${detail.series}-${detail.number}?`)) return;
    try {
      await invoiceService.deleteInvoice(projectId, detail.invoice_id);
      backToList();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar la factura.');
    }
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file || !detail) return;
    setUploadingFile(true);
    try {
      const uploaded = await projectService.uploadFile(projectId, file, 'almacen');
      const updated = await invoiceService.setFile(projectId, detail.invoice_id, uploaded.file_id);
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
      const updated = await invoiceService.setFile(projectId, detail.invoice_id, null);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar el archivo.');
    }
  };

  // Solo tiene sentido agregar una línea suelta cuando la factura es directa (sin orden) — una
  // factura con orden solo admite las líneas de esa orden.
  const startAddLine = () => {
    setNewLineProductId('');
    setNewLineDescription('');
    setNewLineQuantity('');
    setNewLineUnitPrice('');
    setNewLineTotal('');
    setAddingLine(true);
  };

  const confirmAddLine = async () => {
    if (!detail || !newLineProductId || !newLineQuantity.trim() || !newLineTotal.trim()) return;
    setSavingLine(true);
    try {
      const updated = await invoiceService.addItem(projectId, detail.invoice_id, {
        product_id: Number(newLineProductId),
        description: newLineDescription.trim() || (products.find((p) => p.product_id === Number(newLineProductId))?.name ?? ''),
        quantity_invoiced: parseFloat(newLineQuantity),
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

  const saveHeader = async (patch: Record<string, string | number | null>) => {
    if (!detail) return;
    const updated = await invoiceService.updateInvoice(projectId, detail.invoice_id, patch as any);
    setDetail(updated);
    setEditingHeader(false);
  };

  const saveLine = async (patch: Record<string, string | number | null>) => {
    if (!detail || !editingLineId) return;
    const updated = await invoiceService.updateItem(projectId, detail.invoice_id, editingLineId, patch as any);
    setDetail(updated);
    setEditingLineId(null);
  };

  const removeLine = async (itemId: string) => {
    if (!detail) return;
    if (!window.confirm('¿Quitar esta línea?')) return;
    try {
      const updated = await invoiceService.removeItem(projectId, detail.invoice_id, itemId);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar la línea.');
    }
  };

  if (view === 'new') {
    const locked = doc.reading || saving;
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={() => { setView('list'); resetCreateForm(); }} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 mb-3">
          <ArrowLeft size={15} /> Volver a Facturas
        </button>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Nueva factura</h1>

        <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1fr)_26rem] gap-4 items-start">
          <div className={`space-y-4 ${locked ? 'pointer-events-none opacity-60' : ''}`}>
            <DraftNotices warnings={generalWarnings} readNotes={doc.draft?.read_notes ?? []} />

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-[11px] text-gray-500 font-medium">Proveedor<span className="text-red-500"> *</span></span>
                  {supplierLocked ? (
                    <p className="mt-1 px-2.5 py-1.5 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-700">{selectedSupplier?.name}<span className="text-xs text-gray-400"> · el de la orden</span></p>
                  ) : (
                    <SupplierPicker
                      projectId={projectId}
                      selected={selectedSupplier}
                      onSelect={(s) => { setSelectedSupplier(s); setAiFields((p) => ({ ...p, supplier_id: false })); }}
                      flag={flagFor('supplier_id')}
                      message={messageFor('supplier_id')}
                      offer={doc.draft?.supplier.to_create ?? null}
                    />
                  )}
                </div>
                <div>
                  <span className="text-[11px] text-gray-500 font-medium">Orden de compra (opcional)</span>
                  <SearchCombobox<PurchaseOrderListItem>
                    selected={selectedOrder}
                    onSelect={(o) => loadOrder(o ? o.purchase_order_id : null)}
                    search={(term) => purchaseOrderService.getOrders(projectId, { search: term || undefined })}
                    getId={(o) => o.purchase_order_id}
                    getLabel={(o) => `${o.number} — ${o.supplier.name}`}
                    placeholder="Buscar por número o proveedor…"
                    footer={selectedOrder ? (
                      <button type="button" onClick={() => loadOrder(null)} className="text-xs font-medium text-gray-600 hover:underline">Quitar la orden (factura directa)</button>
                    ) : undefined}
                  />
                  {!selectedOrder && <span className="block text-[11px] text-gray-400 mt-0.5">Sin orden es una factura directa. Con orden, cada línea cita una línea de la orden.</span>}
                </div>
                <Field label="Serie" required value={formSeries} onChange={editField('series', setFormSeries)} placeholder="F001" hint="1 a 4 letras o números" flag={flagFor('series')} message={messageFor('series')} />
                <Field label="Número" required value={formNumber} onChange={editField('number', setFormNumber)} placeholder="00000123" hint="1 a 8 dígitos" flag={flagFor('number')} message={messageFor('number')} />
                <Field label="Fecha" required type="date" value={formDate} onChange={editField('invoice_date', setFormDate)} flag={flagFor('invoice_date')} message={messageFor('invoice_date')} />
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
                <Field label="Subtotal" type="number" value={formSubtotal} onChange={editField('subtotal_amount', setFormSubtotal)} flag={flagFor('subtotal_amount')} message={messageFor('subtotal_amount')} />
                <Field label="IGV" type="number" value={formTax} onChange={editField('tax_amount', setFormTax)} flag={flagFor('tax_amount')} message={messageFor('tax_amount')} />
                <Field label="Total declarado" type="number" value={formTotal} onChange={editField('total_amount', setFormTotal)} flag={flagFor('total_amount')} message={messageFor('total_amount')} />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800">Líneas</p>
                {!selectedOrder && (
                  <button onClick={() => setLines((prev) => [...prev, emptyLine()])} className="text-xs font-medium border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50">
                    + Línea con producto
                  </button>
                )}
              </div>
              <div className="p-4 space-y-3">
                {lineNote && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{lineNote}</p>}
                {lines.map((l) => (
                  <div key={l.key} className={`border rounded-lg p-3 ${l.ai ? 'border-violet-300 bg-violet-50/40' : 'border-gray-200 bg-gray-50/40'}`}>
                    {l.sourceId !== null ? (
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={l.checked} onChange={(e) => updateLine(l.key, { checked: e.target.checked })} className="accent-[#0056b3]" />
                        <p className="text-sm font-medium text-gray-800 truncate flex-1 min-w-0">{l.label}</p>
                      </div>
                    ) : (
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
                    )}
                    {l.checked && (
                      <div className={`grid grid-cols-1 @sm:grid-cols-[1fr_8rem_8rem_8rem] gap-3 mt-3 ${l.sourceId !== null ? 'pl-7' : ''}`}>
                        {l.sourceId === null && (
                          <Field label="Descripción" value={l.description} onChange={(v) => updateLine(l.key, { description: v })} placeholder={l.product?.name ?? 'Como dice la factura'} />
                        )}
                        <Field label={`Cantidad${l.product ? ` (${l.product.unit})` : ''}`} type="number" value={l.quantity} onChange={(v) => updateLine(l.key, { quantity: v })} className={l.sourceId !== null ? '@sm:col-start-1' : ''} />
                        <Field label="Precio unit." type="number" value={l.unitPrice} onChange={(v) => updateLine(l.key, { unitPrice: v })} />
                        <Field label="Total línea" type="number" value={l.lineTotal} onChange={(v) => updateLine(l.key, { lineTotal: v })} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => { setView('list'); resetCreateForm(); }} className="border border-gray-200 rounded-lg px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={createInvoice} disabled={saving} className="px-6 bg-[#0056b3] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar factura'}
              </button>
            </div>
          </div>

          <DocumentPanel doc={doc} disabled={saving} onRead={() => { doc.read(); }} />
        </div>
      </div>
    );
  }

  if (view === 'detail' && detail) {
    const isDirect = !detail.purchase_order;
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={backToList} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 mb-3">
          <ArrowLeft size={15} /> Volver a Facturas
        </button>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{detail.series}-{detail.number} — {detail.supplier.name}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{detail.invoice_date} · {detail.currency}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setEditingHeader((v) => !v)} className="border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
                Editar
              </button>
              <button onClick={removeInvoice} className="border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-50">
              Eliminar factura
            </button>
            </div>
          </div>

          <span className={`inline-block mt-3 text-xs font-medium rounded-full px-2.5 py-0.5 ${isDirect ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-[#0056b3]'}`}>
            {detail.purchase_order ? `Orden ${detail.purchase_order.number}` : 'Factura directa'}
          </span>
          {isDirect && (
            <p className="text-xs text-gray-400 mt-1">Factura sin orden de compra previa. Nunca es obligatoria para poder recibir el material.</p>
          )}

          <div className="grid grid-cols-2 @sm:grid-cols-4 gap-3 mt-4">
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Subtotal</p>
              <p className="text-sm font-bold text-gray-800">{detail.subtotal_amount != null ? trimNumeric(detail.subtotal_amount) : '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Impuesto</p>
              <p className="text-sm font-bold text-gray-800">{detail.tax_amount != null ? trimNumeric(detail.tax_amount) : '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Total documento</p>
              <p className="text-sm font-bold text-gray-800">{detail.total_amount != null ? trimNumeric(detail.total_amount) : '—'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Suma de líneas</p>
              <p className="text-sm font-bold text-gray-800">{trimNumeric(detail.lines_total)}</p>
            </div>
          </div>
        </div>

        {editingHeader && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
            <EditForm
              title="Editar factura"
              fields={[
              { key: 'series', label: 'Serie', hint: '1 a 4 letras o números' },
              { key: 'number', label: 'Número', hint: '1 a 8 dígitos' },
              { key: 'invoice_date', label: 'Fecha', type: 'date' },
              { key: 'currency', label: 'Moneda', type: 'select', options: [['PEN', 'Soles (PEN)'], ['USD', 'Dólares (USD)']] },
              { key: 'subtotal_amount', label: 'Subtotal', type: 'number', nullable: true },
              { key: 'tax_amount', label: 'IGV', type: 'number', nullable: true },
              { key: 'total_amount', label: 'Total declarado', type: 'number', nullable: true },
            ]}
              initial={{ series: detail.series, number: detail.number, invoice_date: detail.invoice_date, currency: detail.currency, subtotal_amount: detail.subtotal_amount, tax_amount: detail.tax_amount, total_amount: detail.total_amount }}
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
            <p className="text-sm font-semibold text-gray-700">Líneas</p>
            {isDirect && (
              <button onClick={startAddLine} className="flex items-center gap-1.5 text-xs font-semibold text-[#0056b3] hover:underline">
                <Plus size={14} /> Agregar línea
              </button>
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 font-medium">Cant. facturada</th>
                <th className="py-2 font-medium">Precio unit.</th>
                <th className="py-2 font-medium">Total línea</th>
                <th className="py-2 font-medium">Avance de la orden</th>
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
                <tr key={item.invoice_item_id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-800">{item.product ? `${item.product.code} — ${item.product.name}` : item.description}</td>
                  <td className="py-2 text-gray-700">{trimNumeric(item.quantity_invoiced)} {item.product?.unit ?? ''}</td>
                  <td className="py-2 text-gray-500">{item.unit_price != null ? trimNumeric(item.unit_price) : '—'}</td>
                  <td className="py-2 font-semibold text-gray-800">{trimNumeric(item.line_total)}</td>
                  <td className="py-2 text-gray-500 text-xs">
                    <div className="flex items-center gap-1.5">
                      {item.purchase_order_progress ? (
                        <span>ordenado {trimNumeric(item.purchase_order_progress.ordered)} · recibido {trimNumeric(item.purchase_order_progress.received)}</span>
                      ) : (
                        <span>—</span>
                      )}
                      {item.alerts.length > 0 && (
                        <span title={item.alerts.map((a) => a.message).join(' — ')}>
                          <TriangleAlert size={13} className="text-amber-500 flex-shrink-0" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => setEditingLineId(item.invoice_item_id)} className="text-gray-300 hover:text-[#0056b3] mr-2" title="Editar línea">
                      <Pencil size={14} />
                    </button>
                    {isDirect && (
                      <button onClick={() => removeLine(item.invoice_item_id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {editingLineId && (() => {
            const editingLine = detail.items.find((x) => x.invoice_item_id === editingLineId);
            return editingLine ? (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <EditForm
                  key={editingLineId}
                  title="Editar línea"
                  fields={[
                    { key: 'description', label: 'Descripción', span: 3 },
                    { key: 'quantity_invoiced', label: 'Cantidad facturada', type: 'number' },
                    { key: 'unit_price', label: 'Precio unit.', type: 'number', nullable: true },
                    { key: 'line_total', label: 'Total línea', type: 'number' },
                  ]}
                  initial={{ description: editingLine.description, quantity_invoiced: editingLine.quantity_invoiced, unit_price: editingLine.unit_price, line_total: editingLine.line_total }}
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
              <Field
                label="Cantidad"
                type="number"
                value={newLineQuantity}
                onChange={(v) => { setNewLineQuantity(v); setNewLineTotal(recalcTotal(v, newLineUnitPrice) || newLineTotal); }}
              />
              <Field
                label="Precio unit. (opcional)"
                type="number"
                value={newLineUnitPrice}
                onChange={(v) => { setNewLineUnitPrice(v); setNewLineTotal(recalcTotal(newLineQuantity, v) || newLineTotal); }}
              />
              <Field label="Total línea" type="number" value={newLineTotal} onChange={setNewLineTotal} className="@sm:col-span-2" />
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
          <h1 className="text-2xl font-bold text-gray-800">Facturas</h1>
          <p className="text-sm text-gray-400">Cubre una sola orden de compra (o ninguna). Nunca es obligatoria para poder recibir el material.</p>
        </div>
        <button
          onClick={() => { resetCreateForm(); setView('new'); }}
          className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors"
        >
          <Plus size={15} /> Nueva factura
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <label className="block mb-3">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Buscar</span>
          <div className="flex gap-2 mt-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Por serie-número o proveedor..."
              className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            />
            <button
              onClick={() => loadInvoices(search)}
              className="border border-gray-200 rounded-lg px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Filtrar
            </button>
          </div>
        </label>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 font-medium">Serie-número</th>
              <th className="py-2 font-medium">Proveedor</th>
              <th className="py-2 font-medium">Orden de compra</th>
              <th className="py-2 font-medium">Monto</th>
              <th className="py-2 font-medium">Fecha</th>
              <th className="py-2 font-medium">Archivo</th>
            </tr>
          </thead>
          <tbody>
            {!loading && invoices.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-300">Todavía no hay documentos.</td>
              </tr>
            )}
            {invoices.map((inv) => (
              <tr key={inv.invoice_id} onClick={() => openDetail(inv.invoice_id)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50">
                <td className="py-2 font-mono text-xs text-gray-700">{inv.series}-{inv.number}</td>
                <td className="py-2 text-gray-800">{inv.supplier.name}</td>
                <td className="py-2">
                  {inv.purchase_order ? (
                    <span className="text-[#0056b3] font-medium">{inv.purchase_order.number}</span>
                  ) : (
                    <span className="text-purple-600 font-medium">Factura directa</span>
                  )}
                </td>
                <td className="py-2 text-gray-500">{inv.currency} {trimNumeric(inv.total_amount ?? inv.lines_total)}</td>
                <td className="py-2 text-gray-500">{inv.invoice_date}</td>
                <td className="py-2">
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${inv.has_file ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                    {inv.has_file ? 'Archivo' : 'Archivo pendiente'}
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

export default Facturas;
