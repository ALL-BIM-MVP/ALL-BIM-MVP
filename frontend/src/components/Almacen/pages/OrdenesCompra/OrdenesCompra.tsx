import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Pencil, Plus, Trash2, TriangleAlert, X } from 'lucide-react';
import { purchaseOrderService } from '../../../../services/almacen/purchaseOrder.service';
import { quotationService } from '../../../../services/almacen/quotation.service';
import { purchaseRequisitionService } from '../../../../services/almacen/purchaseRequisition.service';
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
  Currency, DraftItemMatch, DraftProductCandidate, Product, PurchaseOrderDetail, PurchaseOrderItemInput, PurchaseOrderListItem,
  PurchaseRequisitionDetail, PurchaseRequisitionListItem, QuotationDetail, QuotationListItem, Supplier,
} from '../../../../types/almacen.types';
import { resolveMediaUrl } from '../../../../utils/media';
import { trimNumeric } from '../../../../utils/numberFormat';

interface OrdenesCompraProps {
  projectId: number;
}

// Una línea del formulario de creación. Con origen (cotización o requerimiento) nace de una línea del origen
// (sourceId) y solo se marca o ajusta; en compra directa el usuario elige el producto del catálogo.
interface OrderLine {
  key: number;
  sourceId: string | null;
  productId: string | null; // producto de la línea de origen — para emparejar con lo que leyó la IA
  label: string;
  product: Product | null; // solo compra directa
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
const emptyLine = (): OrderLine => ({
  key: ++lineKey, sourceId: null, productId: null, label: '', product: null, description: '',
  quantity: '', unitPrice: '', lineTotal: '', checked: true, ai: false, candidates: [],
});

type OrderMode = 'quotation' | 'requisition' | 'direct';

const OrdenesCompra: React.FC<OrdenesCompraProps> = ({ projectId }) => {
  const [orders, setOrders] = useState<PurchaseOrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [products, setProducts] = useState<Product[]>([]);

  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [mode, setMode] = useState<OrderMode>('quotation');
  const [formNumber, setFormNumber] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCurrency, setFormCurrency] = useState<Currency>('PEN');
  const [formTerms, setFormTerms] = useState('');
  const [formTotal, setFormTotal] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [selectedQuotation, setSelectedQuotation] = useState<QuotationListItem | null>(null);
  const [quotationDetail, setQuotationDetail] = useState<QuotationDetail | null>(null);
  const [selectedRequisition, setSelectedRequisition] = useState<PurchaseRequisitionListItem | null>(null);
  const [requisitionDetail, setRequisitionDetail] = useState<PurchaseRequisitionDetail | null>(null);
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [aiFields, setAiFields] = useState<Record<string, boolean>>({});
  const [lineNote, setLineNote] = useState<string | null>(null);
  const appliedLines = useRef('');
  const doc = useDocumentFile(projectId, 'purchase-order');

  const [addingLine, setAddingLine] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [newLineProductId, setNewLineProductId] = useState<number | ''>('');
  const [newLineDescription, setNewLineDescription] = useState('');
  const [newLineQuantity, setNewLineQuantity] = useState('');
  const [newLineUnitPrice, setNewLineUnitPrice] = useState('');
  const [newLineTotal, setNewLineTotal] = useState('');
  const [savingLine, setSavingLine] = useState(false);

  const loadOrders = (term?: string) => {
    setLoading(true);
    purchaseOrderService
      .getOrders(projectId, { search: term })
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  };

  // Siempre trae datos frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    loadOrders();
    productService.getProducts(projectId).then(setProducts).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const resetCreateForm = () => {
    setMode('quotation');
    setFormNumber('');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormCurrency('PEN');
    setFormTerms('');
    setFormTotal('');
    setSelectedQuotation(null);
    setQuotationDetail(null);
    setSelectedRequisition(null);
    setRequisitionDetail(null);
    setSelectedSupplier(null);
    setLines([]);
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

  // Cambiar de pestaña cambia el origen: se descartan origen y líneas (el encabezado se conserva).
  const changeMode = (next: OrderMode) => {
    if (next === mode) return;
    setMode(next);
    setSelectedQuotation(null);
    setQuotationDetail(null);
    setSelectedRequisition(null);
    setRequisitionDetail(null);
    setLines(next === 'direct' ? [emptyLine()] : []);
    setLineNote(null);
    appliedLines.current = '';
  };

  // Desde cotización: el proveedor es el de la cotización y se cargan TODAS sus líneas tal como se
  // cotizaron — se desmarcan o ajustan antes de ordenar.
  const pickQuotation = async (q: QuotationListItem | null) => {
    setSelectedQuotation(q);
    setLineNote(null);
    appliedLines.current = '';
    if (!q) { setQuotationDetail(null); setLines([]); return; }
    try {
      const full = await quotationService.getQuotationById(projectId, q.quotation_id);
      setSelectedSupplier(full.supplier as unknown as Supplier);
      setLines(full.items.map((it) => ({
        ...emptyLine(),
        sourceId: it.quotation_item_id,
        productId: it.product ? String(it.product.product_id) : null,
        label: it.product ? `${it.product.code} — ${it.product.name}` : it.description,
        description: it.description,
        quantity: trimNumeric(it.quantity_quoted),
        unitPrice: it.unit_price != null ? trimNumeric(it.unit_price) : '',
        lineTotal: trimNumeric(it.line_total),
        checked: true,
      })));
      setQuotationDetail(full);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo cargar la cotización.');
    }
  };

  // Desde requerimiento (sin cotizar): se cargan sus líneas con lo pedido; el precio lo pone el usuario.
  const pickRequisition = async (r: PurchaseRequisitionListItem | null) => {
    setSelectedRequisition(r);
    setLineNote(null);
    appliedLines.current = '';
    if (!r) { setRequisitionDetail(null); setLines([]); return; }
    try {
      const full = await purchaseRequisitionService.getRequisitionById(projectId, r.purchase_requisition_id);
      setLines(full.items.map((it) => ({
        ...emptyLine(),
        sourceId: it.purchase_requisition_item_id,
        productId: it.product ? String(it.product.product_id) : null,
        label: it.product ? `${it.product.code} — ${it.product.name}` : it.description,
        description: it.description,
        quantity: trimNumeric(it.quantity_requested),
        checked: true,
      })));
      setRequisitionDetail(full);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo cargar el requerimiento.');
    }
  };

  const originReady = mode === 'quotation' ? quotationDetail !== null : mode === 'requisition' ? requisitionDetail !== null : true;
  const supplierLocked = mode === 'quotation' && selectedQuotation !== null;

  // Borrador leído: llena el encabezado (y el proveedor, salvo que la cotización ya lo fije) y, en compra
  // directa, las líneas. Lo que el papel no traía (null) no se toca. Nunca guarda nada.
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
    fill('order_date', d.order_date, setFormDate);
    fill('commercial_terms', d.commercial_terms, setFormTerms);
    fill('total_amount', d.total_amount != null ? trimNumeric(d.total_amount) : null, setFormTotal);
    if (d.currency === 'PEN' || d.currency === 'USD') { setFormCurrency(d.currency); ai.currency = true; }
    if (result.supplier.match && !supplierLocked) { setSelectedSupplier(result.supplier.match as unknown as Supplier); ai.supplier_id = true; }
    setAiFields(ai);
    appliedLines.current = '';
    if (mode === 'direct') {
      const next: OrderLine[] = (d.items ?? []).map((it: any, i: number) => {
        const match = result.items.find((m) => m.index === i);
        const productId = it.product_id ?? match?.suggested_product_id ?? null;
        const qty = it.quantity_ordered != null ? trimNumeric(it.quantity_ordered) : '';
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
          checked: true,
          ai: true,
        };
      });
      setLines(next.length > 0 ? next : [emptyLine()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.draft]);

  // Con origen (cotización o requerimiento): cada línea leída se empareja con la línea del origen del MISMO
  // producto. Una sola vez por borrador+origen, para no pisar lo que el usuario corrija después.
  useEffect(() => {
    const result = doc.draft;
    if (!result || mode === 'direct' || !originReady) return;
    const originId = mode === 'quotation' ? selectedQuotation?.quotation_id : selectedRequisition?.purchase_requisition_id;
    const key = `${result.file_id}:${mode}:${originId}`;
    if (appliedLines.current === key) return;
    appliedLines.current = key;
    const readItems: any[] = result.draft.items ?? [];
    const used = new Set<number>();
    setLines((prev) => prev.map((l) => {
      const idx = readItems.findIndex((it, i) => {
        if (used.has(i)) return false;
        const productId = it.product_id ?? result.items.find((m) => m.index === i)?.suggested_product_id ?? null;
        return productId !== null && l.productId !== null && String(productId) === l.productId;
      });
      if (idx === -1) return { ...l, checked: false, ai: false };
      used.add(idx);
      const it = readItems[idx];
      const qty = it.quantity_ordered != null ? trimNumeric(it.quantity_ordered) : l.quantity;
      const price = it.unit_price != null ? trimNumeric(it.unit_price) : l.unitPrice;
      return { ...l, checked: true, ai: true, quantity: qty, unitPrice: price, lineTotal: it.line_total != null ? trimNumeric(it.line_total) : recalcTotal(qty, price) || l.lineTotal };
    }));
    const orphans = readItems.filter((_, i) => !used.has(i));
    setLineNote(orphans.length > 0
      ? `${orphans.length} material(es) o equipo(s) del documento no coinciden con ningún material o equipo del origen elegido: ${orphans.map((o) => o.description).filter(Boolean).join('; ')}.`
      : null);
  }, [doc.draft, originReady, mode, selectedQuotation, selectedRequisition]);

  const warningsFor = (field: string) => doc.draft?.warnings.filter((w) => w.field === field) ?? [];
  const flagFor = (field: string): FieldFlag => (aiFields[field] ? (warningsFor(field).length > 0 ? 'warn' : 'ai') : undefined);
  const messageFor = (field: string) => (aiFields[field] ? warningsFor(field)[0]?.message : undefined);
  const HEADER_FIELDS = ['number', 'order_date', 'commercial_terms', 'total_amount', 'currency', 'supplier_id'];
  const generalWarnings = sortWarnings((doc.draft?.warnings ?? []).filter((w) => !w.field || !HEADER_FIELDS.includes(w.field)));

  const updateLine = (key: number, patch: Partial<OrderLine>) => setLines((prev) => prev.map((l) => {
    if (l.key !== key) return l;
    const next = { ...l, ...patch, ai: false };
    if (('quantity' in patch || 'unitPrice' in patch) && !('lineTotal' in patch)) next.lineTotal = recalcTotal(next.quantity, next.unitPrice) || next.lineTotal;
    return next;
  }));
  const searchProducts = (term: string) => {
    const t = term.trim().toLowerCase();
    return Promise.resolve(products.filter((p) => !t || p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t)).slice(0, 30));
  };

  const createOrder = async () => {
    if (!selectedSupplier || !formNumber.trim()) {
      window.alert('Completá el proveedor y el número de la orden.');
      return;
    }
    if (mode === 'quotation' && !selectedQuotation) { window.alert('Elegí la cotización de origen.'); return; }
    if (mode === 'requisition' && !selectedRequisition) { window.alert('Elegí el requerimiento de origen.'); return; }

    const items: PurchaseOrderItemInput[] = lines
      .filter((l) => l.checked && (l.sourceId !== null || l.product) && parseFloat(l.quantity) > 0 && l.lineTotal.trim() !== '')
      .map((l) => {
        const base = {
          description: l.description.trim() || l.product?.name || l.label,
          quantity_ordered: parseFloat(l.quantity),
          unit_price: l.unitPrice.trim() ? parseFloat(l.unitPrice) : null,
          line_total: parseFloat(l.lineTotal),
        };
        if (mode === 'quotation') return { ...base, quotation_item_id: l.sourceId };
        if (mode === 'requisition') return { ...base, purchase_requisition_item_id: l.sourceId };
        return { ...base, product_id: l.product!.product_id };
      });
    if (items.length === 0) {
      window.alert('Marcá al menos un material o equipo con cantidad y total.');
      return;
    }

    setSaving(true);
    try {
      const fileId = await doc.ensureUploaded();
      await purchaseOrderService.createOrder(projectId, {
        supplier_id: Number(selectedSupplier.supplier_id),
        quotation_id: mode === 'quotation' ? selectedQuotation!.quotation_id : null,
        purchase_requisition_id: mode === 'requisition' ? selectedRequisition!.purchase_requisition_id : null,
        number: formNumber.trim(),
        order_date: formDate,
        currency: formCurrency,
        commercial_terms: formTerms.trim() || null,
        total_amount: formTotal.trim() ? parseFloat(formTotal) : null,
        items,
        file_id: fileId,
      });
      setView('list');
      resetCreateForm();
      loadOrders(search);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo crear la orden.');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = (id: string) => {
    purchaseOrderService
      .getOrderById(projectId, id)
      .then((d) => {
        setDetail(d);
        setView('detail');
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : 'No se pudo abrir la orden.'));
  };

  const backToList = () => {
    setEditingHeader(false);
    setEditingLineId(null);
    setView('list');
    setDetail(null);
    setAddingLine(false);
    loadOrders(search);
  };

  const removeOrder = async () => {
    if (!detail) return;
    if (!window.confirm(`¿Eliminar la orden ${detail.number}?`)) return;
    try {
      await purchaseOrderService.deleteOrder(projectId, detail.purchase_order_id);
      backToList();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar la orden.');
    }
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file || !detail) return;
    setUploadingFile(true);
    try {
      const uploaded = await projectService.uploadFile(projectId, file, 'almacen');
      const updated = await purchaseOrderService.setFile(projectId, detail.purchase_order_id, uploaded.file_id);
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
      const updated = await purchaseOrderService.setFile(projectId, detail.purchase_order_id, null);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar el archivo.');
    }
  };

  // Solo tiene sentido agregar una línea suelta cuando la orden es de compra directa (sin
  // origen) — una orden con cotización/requerimiento solo admite las líneas de ese origen.
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
      const updated = await purchaseOrderService.addItem(projectId, detail.purchase_order_id, {
        product_id: Number(newLineProductId),
        description: newLineDescription.trim() || (products.find((p) => p.product_id === Number(newLineProductId))?.name ?? ''),
        quantity_ordered: parseFloat(newLineQuantity),
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
    const updated = await purchaseOrderService.updateOrder(projectId, detail.purchase_order_id, patch as any);
    setDetail(updated);
    setEditingHeader(false);
  };

  const saveLine = async (patch: Record<string, string | number | null>) => {
    if (!detail || !editingLineId) return;
    const updated = await purchaseOrderService.updateItem(projectId, detail.purchase_order_id, editingLineId, patch as any);
    setDetail(updated);
    setEditingLineId(null);
  };

  const removeLine = async (itemId: string) => {
    if (!detail) return;
    if (!window.confirm('¿Quitar este material o equipo?')) return;
    try {
      const updated = await purchaseOrderService.removeItem(projectId, detail.purchase_order_id, itemId);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar el material o equipo.');
    }
  };

  const originLabel = (o: PurchaseOrderListItem) => {
    if (o.quotation) return `Cotización ${o.quotation.number}`;
    if (o.purchase_requisition) return `Requerimiento ${o.purchase_requisition.number}`;
    return 'Compra directa';
  };

  if (view === 'new') {
    const locked = doc.reading || saving;
    const MODES: Array<{ key: OrderMode; label: string }> = [
      { key: 'quotation', label: 'Desde una cotización' },
      { key: 'requisition', label: 'Desde un requerimiento' },
      { key: 'direct', label: 'Compra directa' },
    ];
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={() => { setView('list'); resetCreateForm(); }} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 mb-3">
          <ArrowLeft size={15} /> Volver a Órdenes de compra
        </button>
        <h1 className="text-2xl font-bold text-gray-800 mb-4">Nueva orden de compra</h1>

        <div className="grid grid-cols-1 @4xl:grid-cols-[minmax(0,1fr)_26rem] gap-4 items-start">
          <div className={`space-y-4 ${locked ? 'pointer-events-none opacity-60' : ''}`}>
            <DraftNotices warnings={generalWarnings} readNotes={doc.draft?.read_notes ?? []} />

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
              <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden mb-4">
                {MODES.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => changeMode(m.key)}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${mode === m.key ? 'bg-[#0056b3] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3">
                {mode === 'quotation' && (
                  <div className="@sm:col-span-2">
                    <span className="text-[11px] text-gray-500 font-medium">Cotización de origen<span className="text-red-500"> *</span></span>
                    <SearchCombobox<QuotationListItem>
                      selected={selectedQuotation}
                      onSelect={pickQuotation}
                      search={(term) => quotationService.getQuotations(projectId, { search: term || undefined })}
                      getId={(q) => q.quotation_id}
                      getLabel={(q) => `${q.number} — ${q.supplier.name}`}
                      getSubLabel={(q) => `Requerimiento ${q.purchase_requisition.number}`}
                      placeholder="Buscar por número, proveedor o requerimiento…"
                    />
                    {!selectedQuotation && (
                      <p className="mt-1.5 inline-block text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">Sin vincular: busca y elige un registro de la lista.</p>
                    )}
                  </div>
                )}
                {mode === 'requisition' && (
                  <div className="@sm:col-span-2">
                    <span className="text-[11px] text-gray-500 font-medium">Requerimiento de origen<span className="text-red-500"> *</span></span>
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
                )}
                <div className={mode === 'direct' ? '@sm:col-span-3' : ''}>
                  <span className="text-[11px] text-gray-500 font-medium">Proveedor<span className="text-red-500"> *</span></span>
                  {supplierLocked ? (
                    <p className="mt-1 px-2.5 py-1.5 border border-gray-200 bg-gray-50 rounded-lg text-sm text-gray-700">{selectedSupplier?.name}<span className="text-xs text-gray-400"> · el de la cotización</span></p>
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
                <Field label="Número de la orden" required value={formNumber} onChange={editField('number', setFormNumber)} placeholder="OC-2026-001" flag={flagFor('number')} message={messageFor('number')} />
                <Field label="Fecha" required type="date" value={formDate} onChange={editField('order_date', setFormDate)} flag={flagFor('order_date')} message={messageFor('order_date')} />
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
                <Field label="Total declarado" type="number" value={formTotal} onChange={editField('total_amount', setFormTotal)} flag={flagFor('total_amount')} message={messageFor('total_amount')} />
                <Field label="Condiciones" value={formTerms} onChange={editField('commercial_terms', setFormTerms)} className="@sm:col-span-2" flag={flagFor('commercial_terms')} message={messageFor('commercial_terms')} />
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-800">Materiales y equipos</p>
                {mode === 'direct' && (
                  <button onClick={() => setLines((prev) => [...prev, emptyLine()])} className="text-xs font-medium border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50">
                    + Material o equipo
                  </button>
                )}
              </div>
              <div className="p-4 space-y-3">
                {lineNote && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{lineNote}</p>}
                {!originReady ? (
                  <div className="border border-dashed border-gray-300 rounded-lg py-8 text-center text-sm text-gray-400">Elige el origen para cargar sus materiales y equipos.</div>
                ) : (
                  lines.map((l) => (
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
                        <div className={`grid grid-cols-1 @sm:grid-cols-3 gap-3 mt-3 ${l.sourceId !== null ? 'pl-7' : ''}`}>
                          <Field label={`Cantidad${l.product ? ` (${l.product.unit})` : ''}`} type="number" value={l.quantity} onChange={(v) => updateLine(l.key, { quantity: v })} />
                          <Field label="Precio unit." type="number" value={l.unitPrice} onChange={(v) => updateLine(l.key, { unitPrice: v })} />
                          <Field label="Total" type="number" value={l.lineTotal} onChange={(v) => updateLine(l.key, { lineTotal: v })} />
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => { setView('list'); resetCreateForm(); }} className="border border-gray-200 rounded-lg px-5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={createOrder} disabled={saving} className="px-6 bg-[#0056b3] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar orden de compra'}
              </button>
            </div>
          </div>

          <DocumentPanel doc={doc} disabled={saving} onRead={() => { doc.read(); }} />
        </div>
      </div>
    );
  }

  if (view === 'detail' && detail) {
    const isDirect = !detail.quotation && !detail.purchase_requisition;
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={backToList} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 mb-3">
          <ArrowLeft size={15} /> Volver a Órdenes de compra
        </button>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">{detail.number} — {detail.supplier.name}</h1>
              <p className="text-sm text-gray-400 mt-0.5">{detail.order_date} · {detail.currency}</p>
              {detail.commercial_terms && <p className="text-sm text-gray-600 mt-2">{detail.commercial_terms}</p>}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <button onClick={() => setEditingHeader((v) => !v)} className="border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
                Editar
              </button>
              <button onClick={removeOrder} className="border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-50">
              Eliminar orden
            </button>
            </div>
          </div>

          <span className={`inline-block mt-3 text-xs font-medium rounded-full px-2.5 py-0.5 ${isDirect ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-[#0056b3]'}`}>
            {detail.quotation ? `Cotización ${detail.quotation.number}` : detail.purchase_requisition ? `Requerimiento ${detail.purchase_requisition.number}` : 'Compra directa'}
          </span>
          {isDirect && (
            <p className="text-xs text-gray-400 mt-1">Orden sin requerimiento ni cotización previa. Igual de válida: solo cambia qué documentos anteriores existen.</p>
          )}

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
        </div>

        {editingHeader && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
            <EditForm
              title="Editar orden de compra"
              fields={[
              { key: 'number', label: 'Número' },
              { key: 'order_date', label: 'Fecha', type: 'date' },
              { key: 'currency', label: 'Moneda', type: 'select', options: [['PEN', 'Soles (PEN)'], ['USD', 'Dólares (USD)']] },
              { key: 'total_amount', label: 'Total declarado', type: 'number', nullable: true },
              { key: 'commercial_terms', label: 'Condiciones', nullable: true, span: 2 },
            ]}
              initial={{ number: detail.number, order_date: detail.order_date, currency: detail.currency, total_amount: detail.total_amount, commercial_terms: detail.commercial_terms }}
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
            {isDirect && (
              <button onClick={startAddLine} className="flex items-center gap-1.5 text-xs font-semibold text-[#0056b3] hover:underline">
                <Plus size={14} /> Agregar material o equipo
              </button>
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
                <th className="py-2 font-medium">Producto</th>
                <th className="py-2 font-medium">Cant. ordenada</th>
                <th className="py-2 font-medium">Precio unit.</th>
                <th className="py-2 font-medium">Total</th>
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
                <tr key={item.purchase_order_item_id} className="border-b border-gray-50">
                  <td className="py-2 text-gray-800">{item.product ? `${item.product.code} — ${item.product.name}` : item.description}</td>
                  <td className="py-2 text-gray-700">{trimNumeric(item.quantity_ordered)} {item.product?.unit ?? ''}</td>
                  <td className="py-2 text-gray-500">{item.unit_price != null ? trimNumeric(item.unit_price) : '—'}</td>
                  <td className="py-2 font-semibold text-gray-800">{trimNumeric(item.line_total)}</td>
                  <td className="py-2 text-gray-500 text-xs">
                    <div className="flex items-center gap-1.5">
                      <span>facturado {trimNumeric(item.progress.invoiced)} · recibido {trimNumeric(item.progress.received)}</span>
                      {item.alerts.length > 0 && (
                        <span title={item.alerts.map((a) => a.message).join(' — ')}>
                          <TriangleAlert size={13} className="text-amber-500 flex-shrink-0" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => setEditingLineId(item.purchase_order_item_id)} className="text-gray-300 hover:text-[#0056b3] mr-2" title="Editar material o equipo">
                      <Pencil size={14} />
                    </button>
                    {isDirect && (
                      <button onClick={() => removeLine(item.purchase_order_item_id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {editingLineId && (() => {
            const editingLine = detail.items.find((x) => x.purchase_order_item_id === editingLineId);
            return editingLine ? (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <EditForm
                  key={editingLineId}
                  title="Editar material o equipo"
                  fields={[
                    { key: 'description', label: 'Descripción', span: 3 },
                    { key: 'quantity_ordered', label: 'Cantidad ordenada', type: 'number' },
                    { key: 'unit_price', label: 'Precio unit.', type: 'number', nullable: true },
                    { key: 'line_total', label: 'Total', type: 'number' },
                  ]}
                  initial={{ description: editingLine.description, quantity_ordered: editingLine.quantity_ordered, unit_price: editingLine.unit_price, line_total: editingLine.line_total }}
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
              <Field label="Total" type="number" value={newLineTotal} onChange={setNewLineTotal} className="@sm:col-span-2" />
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
          <h1 className="text-2xl font-bold text-gray-800">Órdenes de compra</h1>
          <p className="text-sm text-gray-400">Cada una tiene un único proveedor y un único origen: una cotización concreta, un requerimiento sin cotizar, o ninguno (compra directa).</p>
        </div>
        <button
          onClick={() => { resetCreateForm(); setView('new'); }}
          className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors"
        >
          <Plus size={15} /> Nueva orden de compra
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <label className="block mb-3">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Buscar</span>
          <div className="flex gap-2 mt-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Por código o proveedor..."
              className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            />
            <button
              onClick={() => loadOrders(search)}
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
              <th className="py-2 font-medium">Origen</th>
              <th className="py-2 font-medium">Materiales y equipos</th>
              <th className="py-2 font-medium">Monto</th>
              <th className="py-2 font-medium">Fecha</th>
              <th className="py-2 font-medium">Archivo</th>
            </tr>
          </thead>
          <tbody>
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-300">Todavía no hay documentos.</td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.purchase_order_id} onClick={() => openDetail(o.purchase_order_id)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50">
                <td className="py-2 font-mono text-xs text-gray-700">{o.number}</td>
                <td className="py-2 text-gray-800">{o.supplier.name}</td>
                <td className="py-2 text-gray-500">
                  {o.quotation || o.purchase_requisition ? (
                    <span className="text-[#0056b3] font-medium">{originLabel(o)}</span>
                  ) : (
                    <span className="text-purple-600 font-medium">{originLabel(o)}</span>
                  )}
                </td>
                <td className="py-2 text-gray-500">{o.items_count}</td>
                <td className="py-2 text-gray-500">{o.currency} {trimNumeric(o.total_amount ?? o.lines_total)}</td>
                <td className="py-2 text-gray-500">{o.order_date}</td>
                <td className="py-2">
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${o.has_file ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                    {o.has_file ? 'Archivo' : 'Archivo pendiente'}
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

export default OrdenesCompra;
