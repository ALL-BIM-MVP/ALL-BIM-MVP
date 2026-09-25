import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { purchaseOrderService } from '../../../../services/almacen/purchaseOrder.service';
import { quotationService } from '../../../../services/almacen/quotation.service';
import { supplierService } from '../../../../services/almacen/supplier.service';
import { productService } from '../../../../services/almacen/product.service';
import { projectService } from '../../../../services/project.service';
import DocumentAlerts from '../../components/DocumentAlerts';
import {
  Currency, Product, PurchaseOrderDetail, PurchaseOrderItemInput, PurchaseOrderListItem, QuotationDetail,
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

interface OrdenesCompraProps {
  projectId: number;
}

// Líneas desde cotización: precargadas de la línea cotizada, el usuario puede ajustar antes de ordenar.
interface QuotedLineDraft {
  checked: boolean;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
}

// Líneas de compra directa: producto elegido del catálogo, sin ningún origen.
interface DirectLineDraft {
  checked: boolean;
  quantity: string;
  unitPrice: string;
}

type CreateMode = 'quotation' | 'direct' | null;

const OrdenesCompra: React.FC<OrdenesCompraProps> = ({ projectId }) => {
  const [orders, setOrders] = useState<PurchaseOrderListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [quotations, setQuotations] = useState<QuotationListItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [view, setView] = useState<'list' | 'detail' | 'new'>('list');
  const [detail, setDetail] = useState<PurchaseOrderDetail | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [formNumber, setFormNumber] = useState('');
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formCurrency, setFormCurrency] = useState<Currency>('PEN');
  const [formTerms, setFormTerms] = useState('');
  const [formTotal, setFormTotal] = useState('');
  const [saving, setSaving] = useState(false);

  // Modo "desde cotización"
  const [formQuotationId, setFormQuotationId] = useState('');
  const [quotationDetail, setQuotationDetail] = useState<QuotationDetail | null>(null);
  const [quotedLineDrafts, setQuotedLineDrafts] = useState<Record<string, QuotedLineDraft>>({});

  // Modo "compra directa"
  const [formSupplierId, setFormSupplierId] = useState<number | ''>('');
  const [directLineDrafts, setDirectLineDrafts] = useState<Record<number, DirectLineDraft>>({});

  const [addingLine, setAddingLine] = useState(false);
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
    quotationService.getQuotations(projectId).then(setQuotations).catch(() => setQuotations([]));
    supplierService.getSuppliers(projectId).then(setSuppliers).catch(() => setSuppliers([]));
    productService.getProducts(projectId).then(setProducts).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const resetCreateForm = () => {
    setCreateMode(null);
    setFormNumber('');
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormCurrency('PEN');
    setFormTerms('');
    setFormTotal('');
    setFormQuotationId('');
    setQuotationDetail(null);
    setQuotedLineDrafts({});
    setFormSupplierId('');
    setDirectLineDrafts({});
  };

  const recalcTotal = (quantity: string, unitPrice: string) => {
    const q = parseFloat(quantity);
    const p = parseFloat(unitPrice);
    if (!isNaN(q) && !isNaN(p)) return String(Math.round(q * p * 100) / 100);
    return '';
  };

  // Al elegir la cotización, se precarga TODA su lista de líneas con cantidad/precio/total tal
  // como fueron cotizados — el usuario puede desmarcar o ajustar antes de ordenar.
  const pickQuotation = async (quotationId: string) => {
    setFormQuotationId(quotationId);
    setQuotedLineDrafts({});
    if (!quotationId) {
      setQuotationDetail(null);
      return;
    }
    try {
      const q = await quotationService.getQuotationById(projectId, quotationId);
      setQuotationDetail(q);
      const drafts: Record<string, QuotedLineDraft> = {};
      q.items.forEach((it) => {
        drafts[it.quotation_item_id] = {
          checked: true,
          quantity: trimNumeric(it.quantity_quoted),
          unitPrice: it.unit_price != null ? trimNumeric(it.unit_price) : '',
          lineTotal: trimNumeric(it.line_total),
        };
      });
      setQuotedLineDrafts(drafts);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo cargar la cotización.');
    }
  };

  const setQuotedLineField = (itemId: string, field: 'quantity' | 'unitPrice' | 'lineTotal', value: string) => {
    setQuotedLineDrafts((prev) => {
      const current = prev[itemId];
      const next = { ...current, [field]: value };
      if (field !== 'lineTotal') next.lineTotal = recalcTotal(next.quantity, next.unitPrice) || next.lineTotal;
      return { ...prev, [itemId]: next };
    });
  };

  const toggleDirectLine = (productId: number, checked: boolean) => {
    setDirectLineDrafts((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? { quantity: '', unitPrice: '' }), checked } }));
  };

  const setDirectLineField = (productId: number, field: 'quantity' | 'unitPrice', value: string) => {
    setDirectLineDrafts((prev) => ({ ...prev, [productId]: { ...(prev[productId] ?? { checked: true, quantity: '', unitPrice: '' }), [field]: value } }));
  };

  const createOrder = async () => {
    if (!formNumber.trim()) {
      window.alert('Completá el número de la orden.');
      return;
    }

    let supplierId: number | null = null;
    let items: PurchaseOrderItemInput[] = [];

    if (createMode === 'quotation') {
      if (!quotationDetail) {
        window.alert('Elegí una cotización.');
        return;
      }
      supplierId = quotationDetail.supplier.supplier_id;
      items = Object.entries(quotedLineDrafts)
        .filter(([, d]) => d.checked && parseFloat(d.quantity) > 0 && d.lineTotal.trim() !== '')
        .map(([itemId, d]) => {
          const line = quotationDetail.items.find((it) => it.quotation_item_id === itemId);
          return {
            quotation_item_id: itemId,
            description: line?.description ?? '',
            quantity_ordered: parseFloat(d.quantity),
            unit_price: d.unitPrice.trim() ? parseFloat(d.unitPrice) : null,
            line_total: parseFloat(d.lineTotal),
          };
        });
    } else {
      if (!formSupplierId) {
        window.alert('Elegí un proveedor.');
        return;
      }
      supplierId = Number(formSupplierId);
      items = Object.entries(directLineDrafts)
        .filter(([, d]) => d.checked && parseFloat(d.quantity) > 0)
        .map(([productId, d]) => {
          const product = products.find((p) => p.product_id === Number(productId));
          const unitPrice = d.unitPrice.trim() ? parseFloat(d.unitPrice) : null;
          const quantity = parseFloat(d.quantity);
          return {
            product_id: Number(productId),
            description: product?.name ?? '',
            quantity_ordered: quantity,
            unit_price: unitPrice,
            line_total: unitPrice !== null ? Math.round(quantity * unitPrice * 100) / 100 : quantity,
          };
        });
    }

    if (items.length === 0) {
      window.alert('Marcá al menos una línea.');
      return;
    }

    setSaving(true);
    try {
      await purchaseOrderService.createOrder(projectId, {
        supplier_id: supplierId!,
        quotation_id: createMode === 'quotation' ? formQuotationId : null,
        purchase_requisition_id: createMode === 'quotation' ? null : null,
        number: formNumber.trim(),
        order_date: formDate,
        currency: formCurrency,
        commercial_terms: formTerms.trim() || null,
        total_amount: formTotal.trim() ? parseFloat(formTotal) : null,
        items,
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
      window.alert(err instanceof Error ? err.message : 'No se pudo agregar la línea.');
    } finally {
      setSavingLine(false);
    }
  };

  const removeLine = async (itemId: string) => {
    if (!detail) return;
    if (!window.confirm('¿Quitar esta línea?')) return;
    try {
      const updated = await purchaseOrderService.removeItem(projectId, detail.purchase_order_id, itemId);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar la línea.');
    }
  };

  const originLabel = (o: PurchaseOrderListItem) => {
    if (o.quotation) return `Cotización ${o.quotation.number}`;
    if (o.purchase_requisition) return `Requerimiento ${o.purchase_requisition.number}`;
    return 'Compra directa';
  };

  if (view === 'new' && createMode) {
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={() => { setView('list'); resetCreateForm(); }} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 mb-3">
          <ArrowLeft size={15} /> Volver a Órdenes de compra
        </button>
        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          {createMode === 'quotation' ? 'Nueva orden desde cotización' : 'Compra directa'}
        </h1>
        <p className="text-sm text-gray-400 mb-4">
          {createMode === 'direct'
            ? 'Sin requerimiento ni cotización previa. Igual de válida: solo cambia qué documentos anteriores existen.'
            : 'Se adjudica al elegir la cotización: la orden queda vinculada a ella y a su proveedor.'}
        </p>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          {createMode === 'quotation' ? (
            <label className="block mb-3">
              <span className="text-[11px] text-gray-400 uppercase tracking-wide">Cotización a adjudicar</span>
              <select
                value={formQuotationId}
                onChange={(e) => pickQuotation(e.target.value)}
                className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
              >
                <option value="">Elegir...</option>
                {quotations.map((q) => (
                  <option key={q.quotation_id} value={q.quotation_id}>
                    {q.number} — {q.supplier.name} ({q.purchase_requisition.number})
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block mb-3">
              <span className="text-[11px] text-gray-400 uppercase tracking-wide">Proveedor</span>
              <select
                value={formSupplierId}
                onChange={(e) => setFormSupplierId(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
              >
                <option value="">Elegir...</option>
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>{s.name} — {s.ruc}</option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-1 @sm:grid-cols-4 gap-3 mb-3">
            <Field label="Número" value={formNumber} onChange={setFormNumber} placeholder="ej. OC-001" />
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
            <Field label="Total del documento (opcional)" type="number" value={formTotal} onChange={setFormTotal} />
          </div>
          <Field label="Condiciones (opcional)" value={formTerms} onChange={setFormTerms} className="mb-5" />

          {createMode === 'quotation' && quotationDetail && (
            <>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-2">Líneas de la cotización</p>
              <div className="grid grid-cols-1 @lg:grid-cols-2 gap-2 mb-5">
                {quotationDetail.items.map((it) => {
                  const draft = quotedLineDrafts[it.quotation_item_id];
                  return (
                    <div key={it.quotation_item_id} className="border border-gray-200 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-3 mb-2">
                        <input
                          type="checkbox"
                          checked={draft?.checked ?? false}
                          onChange={(e) => setQuotedLineDrafts((prev) => ({ ...prev, [it.quotation_item_id]: { ...prev[it.quotation_item_id], checked: e.target.checked } }))}
                          className="accent-[#0056b3]"
                        />
                        <p className="text-sm font-medium text-gray-800 truncate flex-1 min-w-0">
                          {it.product ? `${it.product.code} — ${it.product.name}` : it.description}
                        </p>
                      </div>
                      {draft?.checked && (
                        <div className="grid grid-cols-3 gap-2 pl-7">
                          <input
                            type="number"
                            placeholder="Cantidad"
                            value={draft.quantity}
                            onChange={(e) => setQuotedLineField(it.quotation_item_id, 'quantity', e.target.value)}
                            className="px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                          />
                          <input
                            type="number"
                            placeholder="Precio unit."
                            value={draft.unitPrice}
                            onChange={(e) => setQuotedLineField(it.quotation_item_id, 'unitPrice', e.target.value)}
                            className="px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                          />
                          <input
                            type="number"
                            placeholder="Total línea"
                            value={draft.lineTotal}
                            onChange={(e) => setQuotedLineField(it.quotation_item_id, 'lineTotal', e.target.value)}
                            className="px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {createMode === 'direct' && (
            <>
              <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-2">Líneas</p>
              <div className="grid grid-cols-1 @lg:grid-cols-2 gap-2 mb-5">
                {products.map((p) => {
                  const draft = directLineDrafts[p.product_id];
                  return (
                    <div key={p.product_id} className="flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2">
                      <input
                        type="checkbox"
                        checked={draft?.checked ?? false}
                        onChange={(e) => toggleDirectLine(p.product_id, e.target.checked)}
                        className="accent-[#0056b3]"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{p.code} — {p.name}</p>
                        <p className="text-xs text-gray-400">{p.unit}</p>
                      </div>
                      <input
                        type="number"
                        placeholder="Cantidad"
                        value={draft?.quantity ?? ''}
                        onChange={(e) => setDirectLineField(p.product_id, 'quantity', e.target.value)}
                        disabled={!draft?.checked}
                        className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] disabled:bg-gray-50"
                      />
                      <input
                        type="number"
                        placeholder="Precio"
                        value={draft?.unitPrice ?? ''}
                        onChange={(e) => setDirectLineField(p.product_id, 'unitPrice', e.target.value)}
                        disabled={!draft?.checked}
                        className="w-20 px-2 py-1 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] disabled:bg-gray-50"
                      />
                    </div>
                  );
                })}
                {products.length === 0 && <p className="text-sm text-gray-400 italic">No hay productos en el catálogo todavía.</p>}
              </div>
            </>
          )}

          <div className="flex justify-end">
            <button onClick={createOrder} disabled={saving} className="px-8 bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50">
              {saving ? 'Creando...' : 'Generar orden de compra'}
            </button>
          </div>
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
            <button onClick={removeOrder} className="flex-shrink-0 border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-red-50">
              Eliminar orden
            </button>
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
              <p className="text-[11px] text-gray-400 uppercase tracking-wide">Suma de líneas</p>
              <p className="text-lg font-bold text-gray-800">{trimNumeric(detail.lines_total)}</p>
            </div>
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
                <th className="py-2 font-medium">Cant. ordenada</th>
                <th className="py-2 font-medium">Precio unit.</th>
                <th className="py-2 font-medium">Total línea</th>
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
          <h1 className="text-2xl font-bold text-gray-800">Órdenes de compra</h1>
          <p className="text-sm text-gray-400">Cada una tiene un único proveedor y un único origen: una cotización concreta, un requerimiento sin cotizar, o ninguno (compra directa).</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { resetCreateForm(); setCreateMode('quotation'); setView('new'); }}
            className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <Plus size={15} /> Desde cotización
          </button>
          <button
            onClick={() => { resetCreateForm(); setCreateMode('direct'); setView('new'); }}
            className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors"
          >
            <Plus size={15} /> Compra directa
          </button>
        </div>
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
              <th className="py-2 font-medium">Líneas</th>
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
