import React, { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, X } from 'lucide-react';
import CiudadModal from '../../components/CiudadModal';
import InlineModelPreview from '../../components/InlineModelPreview';
import { productService } from '../../../../services/almacen/product.service';
import { goodsReceiptService } from '../../../../services/almacen/goodsReceipt.service';
import { supplierService } from '../../../../services/almacen/supplier.service';
import { purchaseOrderService } from '../../../../services/almacen/purchaseOrder.service';
import { projectService } from '../../../../services/project.service';
import { GoodsReceipt, GoodsReceiptEntryType, Product, PurchaseOrderListItem, Supplier } from '../../../../types/almacen.types';
import { trimNumeric } from '../../../../utils/numberFormat';

interface ItemLocation { binId: number; label: string; quantity: string; }

interface ItemRow {
  // Distinto de null solo cuando la línea viene de una Orden de Compra vinculada — en ese caso
  // el producto es el de esa línea (no se elige) y no se puede agregar/quitar libremente.
  purchaseOrderItemId: string | null;
  productId: number | '';
  productLabel: string;
  unit: string;
  cantidad: string;
  quantityPerNote: string;
  locations: ItemLocation[];
}

const emptyItem = (): ItemRow => ({ purchaseOrderItemId: null, productId: '', productLabel: '', unit: '', cantidad: '', quantityPerNote: '', locations: [] });

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

interface NuevoIngresoProps {
  projectId: number;
  onCreated: (receipt: GoodsReceipt) => void;
  onCancel: () => void;
}

const NuevoIngreso: React.FC<NuevoIngresoProps> = ({ projectId, onCreated, onCancel }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderListItem[]>([]);

  const [entryType, setEntryType] = useState<GoodsReceiptEntryType>('rapida');
  const [supplierId, setSupplierId] = useState<number | ''>('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [deliveryNoteSeries, setDeliveryNoteSeries] = useState('');
  const [deliveryNoteNumber, setDeliveryNoteNumber] = useState('');
  const [deliveryNoteDate, setDeliveryNoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receivedDate, setReceivedDate] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [ciudadItemIndex, setCiudadItemIndex] = useState<number | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  // Siempre trae catálogo/proveedores frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    productService.getProducts(projectId).then(setProducts).catch(() => setProducts([]));
    supplierService.getSuppliers(projectId).then(setSuppliers).catch(() => setSuppliers([]));
  }, [projectId]);

  // El proveedor de la orden tiene que ser el mismo que el del ingreso — solo se listan sus órdenes.
  useEffect(() => {
    setPurchaseOrderId('');
    setOrders([]);
    if (!supplierId) return;
    purchaseOrderService.getOrders(projectId, { supplierId: Number(supplierId) }).then(setOrders).catch(() => setOrders([]));
  }, [supplierId, projectId]);

  const isFromOrder = entryType === 'normal' && purchaseOrderId !== '';

  // Elegir la orden precarga UNA línea por cada línea de la orden, con lo ordenado como default —
  // el usuario ajusta la cantidad recibida (puede ser parcial) antes de repartir en casillas.
  const pickOrder = async (id: string) => {
    setPurchaseOrderId(id);
    if (!id) {
      setItems([emptyItem()]);
      return;
    }
    try {
      const order = await purchaseOrderService.getOrderById(projectId, id);
      setItems(order.items.map((it) => ({
        purchaseOrderItemId: it.purchase_order_item_id,
        productId: it.product ? Number(it.product.product_id) : '',
        productLabel: it.product ? `${it.product.code} — ${it.product.name}` : it.description,
        unit: it.product?.unit ?? '',
        cantidad: trimNumeric(it.quantity_ordered),
        quantityPerNote: '',
        locations: [],
      })));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo cargar la orden.');
    }
  };

  const updateItem = (i: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const addLocation = (i: number, loc: { binId: number; label: string }) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, locations: [...it.locations, { ...loc, quantity: '' }] } : it)));
  };
  const updateLocationQty = (i: number, li: number, qty: string) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, locations: it.locations.map((l, lidx) => (lidx === li ? { ...l, quantity: qty } : l)) } : it)));
  };
  const removeLocation = (i: number, li: number) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, locations: it.locations.filter((_, lidx) => lidx !== li) } : it)));
  };

  const sumLocations = (item: ItemRow) => item.locations.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0);
  const getProduct = (id: number | '') => products.find((p) => p.product_id === id);

  const submit = async () => {
    if (!supplierId) { window.alert('Elegí un proveedor.'); return; }
    if (!deliveryNoteSeries.trim() || !deliveryNoteNumber.trim()) { window.alert('Falta la serie o el número de la guía de remisión.'); return; }

    const payloadItems = [];
    for (const item of items) {
      if (!isFromOrder && !item.productId) { window.alert('Todos los ítems necesitan un producto.'); return; }
      const total = parseFloat(item.cantidad);
      if (!total || total <= 0) { window.alert('La cantidad del ítem tiene que ser mayor a 0.'); return; }
      if (item.locations.length === 0) { window.alert('Cada ítem necesita al menos una ubicación.'); return; }
      const sum = sumLocations(item);
      if (Math.abs(sum - total) > 1e-6) {
        window.alert(`La suma de las cantidades por ubicación (${sum}) tiene que ser igual a la cantidad total del ítem (${total}).`);
        return;
      }
      payloadItems.push({
        purchase_order_item_id: isFromOrder ? Number(item.purchaseOrderItemId) : null,
        product_id: isFromOrder ? undefined : (item.productId as number),
        total_quantity: total,
        // El backend solo acepta este campo AUSENTE o con número — nunca `null` (a diferencia de
        // purchase_order_item_id, que sí es nullable).
        quantity_per_delivery_note: item.quantityPerNote.trim() ? parseFloat(item.quantityPerNote) : undefined,
        locations: item.locations.map((l) => ({ bin_id: l.binId, quantity: parseFloat(l.quantity) || 0 })),
      });
    }

    setSaving(true);
    try {
      const receipt = await goodsReceiptService.createGoodsReceipt(projectId, {
        supplier_id: Number(supplierId),
        entry_type: entryType,
        purchase_order_id: isFromOrder ? Number(purchaseOrderId) : null,
        delivery_note_series: deliveryNoteSeries.trim(),
        delivery_note_number: deliveryNoteNumber.trim(),
        delivery_note_date: deliveryNoteDate,
        received_date: receivedDate || undefined,
        items: payloadItems,
      });
      if (scanFile) {
        try {
          const uploaded = await projectService.uploadFile(projectId, scanFile, 'almacen');
          await goodsReceiptService.setFile(projectId, receipt.goods_receipt_id, uploaded.file_id);
        } catch (err) {
          window.alert(err instanceof Error ? `Ingreso registrado, pero no se pudo adjuntar el escaneo: ${err.message}` : 'Ingreso registrado, pero no se pudo adjuntar el escaneo.');
        }
      }
      onCreated(receipt);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo registrar el ingreso.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <button onClick={onCancel} className="text-sm text-[#0056b3] font-medium mb-3">← Volver a Ingresos</button>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Nuevo ingreso</h1>

      <div className="flex flex-col @xl:flex-row gap-4 items-stretch">
        <div className="w-full @xl:flex-1 @xl:max-w-3xl bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Tipo de entrada</p>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => { setEntryType('rapida'); setPurchaseOrderId(''); setItems([emptyItem()]); }}
              className={`rounded-lg py-2 text-sm font-medium border transition-colors ${entryType === 'rapida' ? 'border-[#0056b3] bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Rápida (sin documentos previos)
            </button>
            <button
              onClick={() => setEntryType('normal')}
              className={`rounded-lg py-2 text-sm font-medium border transition-colors ${entryType === 'normal' ? 'border-[#0056b3] bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              Normal (puede citar una orden)
            </button>
          </div>

          <p className="text-sm font-semibold text-gray-700 mb-3">Datos de la guía</p>
          <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3 mb-3">
            <label className="block">
              <span className="text-[11px] text-gray-400 uppercase tracking-wide">Proveedor</span>
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
              >
                <option value="">Elegir...</option>
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>{s.name} — {s.ruc}</option>
                ))}
              </select>
            </label>
            {entryType === 'normal' && (
              <label className="block">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Orden de compra (opcional)</span>
                <select
                  value={purchaseOrderId}
                  onChange={(e) => pickOrder(e.target.value)}
                  disabled={!supplierId}
                  className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] disabled:bg-gray-50"
                >
                  <option value="">Sin vincular todavía</option>
                  {orders.map((o) => (
                    <option key={o.purchase_order_id} value={o.purchase_order_id}>{o.number}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="grid grid-cols-1 @sm:grid-cols-4 gap-3 mb-4">
            <Field label="Serie" value={deliveryNoteSeries} onChange={setDeliveryNoteSeries} placeholder="T001" />
            <Field label="Número" value={deliveryNoteNumber} onChange={setDeliveryNoteNumber} placeholder="000451" />
            <Field label="Fecha de guía" type="date" value={deliveryNoteDate} onChange={setDeliveryNoteDate} />
            <Field label="Fecha de recepción (opcional)" type="date" value={receivedDate} onChange={setReceivedDate} />
          </div>

          <p className="text-sm font-semibold text-gray-700 mt-5 mb-3">Ítems que llegan</p>
          <div className="space-y-4">
            {items.map((item, i) => {
              const product = isFromOrder ? null : getProduct(item.productId);
              const total = parseFloat(item.cantidad) || 0;
              const diff = total - sumLocations(item);
              return (
                <div key={i} className="border border-gray-100 rounded-lg p-3">
                  <div className="grid grid-cols-1 @sm:grid-cols-[1fr_8rem_auto] gap-2 items-end">
                    {isFromOrder ? (
                      <div>
                        <span className="text-[11px] text-gray-400 uppercase tracking-wide">Producto (de la orden)</span>
                        <p className="text-sm text-gray-800 mt-1">{item.productLabel}</p>
                      </div>
                    ) : (
                      <label className="block">
                        <span className="text-[11px] text-gray-400 uppercase tracking-wide">Producto</span>
                        <select
                          value={item.productId}
                          onChange={(e) => updateItem(i, { productId: e.target.value ? parseInt(e.target.value, 10) : '' })}
                          className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                        >
                          <option value="">Elege un producto...</option>
                          {products.map((p) => (
                            <option key={p.product_id} value={p.product_id}>{p.code} — {p.name}</option>
                          ))}
                        </select>
                      </label>
                    )}
                    <Field
                      label={`Cantidad recibida${product ? ` (${product.unit})` : isFromOrder && item.unit ? ` (${item.unit})` : ''}`}
                      value={item.cantidad}
                      onChange={(v) => updateItem(i, { cantidad: v })}
                    />
                    <button
                      onClick={() => removeItem(i)}
                      disabled={items.length === 1}
                      className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300 pb-2"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="mt-2 space-y-1.5">
                    {item.locations.map((loc, li) => (
                      <div key={li} className="flex items-center gap-2">
                        <span className="flex-1 text-xs text-gray-600 truncate bg-gray-50 rounded-lg px-2.5 py-1.5">{loc.label}</span>
                        <input
                          value={loc.quantity}
                          onChange={(e) => updateLocationQty(i, li, e.target.value)}
                          placeholder="Cant."
                          className="w-20 px-2 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                        />
                        <button onClick={() => removeLocation(i, li)} className="text-gray-300 hover:text-red-500">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => setCiudadItemIndex(i)} className="flex items-center gap-1.5 text-xs font-medium text-[#0056b3] mt-1">
                      <MapPin size={13} /> {item.locations.length === 0 ? 'Elegir ubicación' : '+ Agregar ubicación'}
                    </button>
                    {item.locations.length > 0 && (
                      <p className={`text-[11px] mt-1 ${Math.abs(diff) < 1e-6 ? 'text-gray-400' : 'text-amber-600'}`}>
                        {Math.abs(diff) < 1e-6 ? 'Reparto completo.' : diff > 0 ? `Faltan repartir ${diff}.` : `Sobran ${Math.abs(diff)} de más.`}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {!isFromOrder && (
            <button onClick={addItem} className="flex items-center gap-1.5 text-sm text-[#0056b3] font-medium mt-3">
              <Plus size={15} /> Agregar ítem
            </button>
          )}

          <div className="mt-5">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Escaneo de la guía (opcional)</span>
            <input
              type="file"
              onChange={(e) => setScanFile(e.target.files?.[0] ?? null)}
              className="block w-full mt-1 text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-[#0056b3] hover:file:bg-blue-100"
            />
          </div>

          <div className="flex justify-end">
            <button
              onClick={submit}
              disabled={saving}
              className="mt-6 px-8 bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50"
            >
              {saving ? 'Registrando...' : 'Confirmar ingreso'}
            </button>
          </div>
        </div>

        {items.some((it) => getProduct(it.productId)?.model_3d_asset_id != null) && (
          <div className="w-full @xl:w-[34rem] flex-shrink-0 space-y-4">
            {items.map((item, i) => {
              const previewProduct = getProduct(item.productId);
              if (previewProduct?.model_3d_asset_id == null) return null;
              return (
                <div key={i} className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                  <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 truncate">
                    {previewProduct.code} — {previewProduct.name}
                  </p>
                  <InlineModelPreview projectId={projectId} assetId={previewProduct.model_3d_asset_id} className="w-full h-[32rem]" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {ciudadItemIndex !== null && (
        <CiudadModal
          projectId={projectId}
          onClose={() => setCiudadItemIndex(null)}
          pickMode={{
            itemLabel: (isFromOrder ? items[ciudadItemIndex]?.productLabel : getProduct(items[ciudadItemIndex]?.productId)?.name) || 'este ítem',
            itemModelPath: getProduct(items[ciudadItemIndex]?.productId)?.model_3d_url,
            onConfirm: (bin) => addLocation(ciudadItemIndex, { binId: bin.binId, label: bin.label }),
          }}
        />
      )}
    </div>
  );
};

export default NuevoIngreso;
