import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus, Trash2, MapPin, X } from 'lucide-react';
import CiudadModal from '../../components/CiudadModal';
import InlineModelPreview from '../../components/InlineModelPreview';
import CreateProductModal from '../../components/CreateProductModal';
import DocumentPanel from '../../components/DocumentPanel';
import SupplierPicker from '../../components/SupplierPicker';
import { useDocumentFile } from '../../components/useDocumentFile';
import { DraftNotices, Field, FieldFlag, sortWarnings } from '../../components/FormField';
import { productService } from '../../../../services/almacen/product.service';
import { goodsReceiptService } from '../../../../services/almacen/goodsReceipt.service';
import { purchaseOrderService } from '../../../../services/almacen/purchaseOrder.service';
import { rackService } from '../../../../services/almacen/rack.service';
import { binService } from '../../../../services/almacen/bin.service';
import { ObjectOrientation } from '../../utils/WarehouseInteriorScene';
import { DraftProductCandidate, GoodsReceipt, GoodsReceiptEntryType, Product, PurchaseOrderListItem, Supplier } from '../../../../types/almacen.types';
import { trimNumeric } from '../../../../utils/numberFormat';

interface ItemLocation {
  binId: number;
  label: string;
  quantity: string;
  // Guardados al elegir la casilla (sliders "Escala"/"Rotación" y postura del selector) — recién se
  // pueden persistir (binService.updateContentPose, Fase A) DESPUÉS de crear el ingreso, cuando existe
  // el bin_content_id real. warehouseId/rackId son los del estante donde está esta casilla.
  warehouseId: number;
  rackId: number;
  scale: number;
  rotationDeg: number;
  orientation: ObjectOrientation;
}

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
  candidates?: DraftProductCandidate[]; // sugeridos por la IA cuando no hubo coincidencia clara
  ai?: boolean; // lo llenó la IA y no se tocó
}

const emptyItem = (): ItemRow => ({ purchaseOrderItemId: null, productId: '', productLabel: '', unit: '', cantidad: '', quantityPerNote: '', locations: [] });

interface NuevoIngresoProps {
  projectId: number;
  onCreated: (receipt: GoodsReceipt) => void;
  onCancel: () => void;
}

const NuevoIngreso: React.FC<NuevoIngresoProps> = ({ projectId, onCreated, onCancel }) => {
  const [products, setProducts] = useState<Product[]>([]);
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
  const [saving, setSaving] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [creatingProductFor, setCreatingProductFor] = useState<number | null>(null);
  const [aiFields, setAiFields] = useState<Record<string, boolean>>({});
  const [lineNote, setLineNote] = useState<string | null>(null);
  const pendingOrder = useRef<string | null>(null);
  const appliedLines = useRef('');
  const doc = useDocumentFile(projectId, 'goods-receipt');

  // Siempre trae catálogo/proveedores frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    productService.getProducts(projectId).then(setProducts).catch(() => setProducts([]));
  }, [projectId]);

  // El proveedor de la orden tiene que ser el mismo que el del ingreso — solo se listan sus órdenes.
  useEffect(() => {
    setPurchaseOrderId('');
    setOrders([]);
    if (!supplierId) return;
    purchaseOrderService.getOrders(projectId, { supplierId: Number(supplierId) })
      .then((list) => {
        setOrders(list);
        if (pendingOrder.current) {
          const id = pendingOrder.current;
          pendingOrder.current = null;
          pickOrder(id);
        }
      })
      .catch(() => setOrders([]));
  }, [supplierId, projectId]);

  const chooseSupplier = (supplier: Supplier | null) => {
    setSelectedSupplier(supplier);
    setSupplierId(supplier ? Number(supplier.supplier_id) : '');
    setAiFields((prev) => ({ ...prev, supplier_id: false }));
  };

  const editField = (field: string, setter: (v: string) => void) => (v: string) => {
    setter(v);
    setAiFields((prev) => ({ ...prev, [field]: false }));
  };

  const isFromOrder = entryType === 'normal' && purchaseOrderId !== '';

  // Elegir la orden precarga UNA línea por cada línea de la orden, con lo ordenado como default —
  // el usuario ajusta la cantidad recibida (puede ser parcial) antes de repartir en casillas.
  const pickOrder = async (id: string) => {
    setPurchaseOrderId(id);
    setLineNote(null);
    appliedLines.current = '';
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

  const addLocation = (i: number, loc: Omit<ItemLocation, 'quantity'>) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, locations: [...it.locations, { ...loc, quantity: '' }] } : it)));
  };
  // Atajo "Llenar todo el estante" (a modo de prueba): 1 unidad por casilla vacía, de pie, sin ajustar
  // escala ni rotación — el usuario puede editar cada cantidad después a mano, como cualquier ubicación.
  const addLocations = (i: number, bins: Array<{ binId: number; label: string; warehouseId: number; rackId: number }>) => {
    const newLocations: ItemLocation[] = bins.map((b) => ({ ...b, quantity: '1', scale: 1, rotationDeg: 0, orientation: 'pie' }));
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, locations: [...it.locations, ...newLocations] } : it)));
  };
  const updateLocationQty = (i: number, li: number, qty: string) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, locations: it.locations.map((l, lidx) => (lidx === li ? { ...l, quantity: qty } : l)) } : it)));
  };
  const removeLocation = (i: number, li: number) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, locations: it.locations.filter((_, lidx) => lidx !== li) } : it)));
  };

  const sumLocations = (item: ItemRow) => item.locations.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0);
  const getProduct = (id: number | '') => products.find((p) => p.product_id === id);

  // Borrador leído de la guía: llena la cabecera y el proveedor; si cita una orden que existe, la elige y carga
  // sus líneas. En la guía NO salen lo recibido ni las casillas (eso lo pone el usuario): solo lo que dice el
  // papel ("Según guía"). Lo que no trae (null) no se toca. Nunca guarda nada.
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
    fill('delivery_note_series', d.delivery_note_series, setDeliveryNoteSeries);
    fill('delivery_note_number', d.delivery_note_number, setDeliveryNoteNumber);
    fill('delivery_note_date', d.delivery_note_date, setDeliveryNoteDate);
    if (result.supplier.match) ai.supplier_id = true;
    setAiFields(ai);
    appliedLines.current = '';
    setLineNote(null);

    const orderMatch = result.purchase_order.match;
    if (orderMatch) {
      setEntryType('normal');
      purchaseOrderService.getOrderById(projectId, orderMatch.purchase_order_id).then((order) => {
        if (Number(supplierId) === Number(order.supplier.supplier_id)) {
          pickOrder(orderMatch.purchase_order_id);
        } else {
          pendingOrder.current = orderMatch.purchase_order_id;
          setSelectedSupplier(order.supplier as unknown as Supplier);
          setSupplierId(Number(order.supplier.supplier_id));
        }
      }).catch(() => {});
      return;
    }
    if (result.supplier.match) {
      setSelectedSupplier(result.supplier.match as unknown as Supplier);
      setSupplierId(Number(result.supplier.match.supplier_id));
    }
    if (!isFromOrder) {
      const next: ItemRow[] = (d.items ?? []).map((it: any, i: number) => {
        const match = result.items.find((m) => m.index === i);
        const productId = it.product_id ?? match?.suggested_product_id ?? null;
        return {
          ...emptyItem(),
          productId: productId !== null && products.some((p) => String(p.product_id) === String(productId)) ? Number(productId) : '',
          quantityPerNote: it.quantity_per_delivery_note != null ? trimNumeric(it.quantity_per_delivery_note) : '',
          candidates: match?.product_candidates ?? [],
          ai: true,
        };
      });
      if (next.length > 0) setItems(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.draft]);

  // Con orden: cada línea leída se empareja con la línea de la orden que ya calculó el servidor
  // (order_item_candidate); si no hubo, con la del MISMO producto. Una sola vez por borrador+orden.
  useEffect(() => {
    const result = doc.draft;
    if (!result || !isFromOrder || items.some((it) => it.purchaseOrderItemId === null)) return;
    const key = `${result.file_id}:${purchaseOrderId}`;
    if (appliedLines.current === key) return;
    appliedLines.current = key;
    const readItems: any[] = result.draft.items ?? [];
    const used = new Set<number>();
    setItems((prev) => prev.map((row) => {
      const idx = readItems.findIndex((it, i) => {
        if (used.has(i)) return false;
        const cited = it.purchase_order_item_id ?? result.items.find((m) => m.index === i)?.order_item_candidate?.purchase_order_item_id ?? null;
        if (cited !== null) return String(cited) === row.purchaseOrderItemId;
        const productId = it.product_id ?? result.items.find((m) => m.index === i)?.suggested_product_id ?? null;
        return productId !== null && row.productId !== '' && String(productId) === String(row.productId);
      });
      if (idx === -1) return row;
      used.add(idx);
      const q = readItems[idx].quantity_per_delivery_note;
      return { ...row, quantityPerNote: q != null ? trimNumeric(q) : row.quantityPerNote, ai: q != null };
    }));
    const orphans = readItems.filter((_, i) => !used.has(i));
    setLineNote(orphans.length > 0
      ? `${orphans.length} línea(s) de la guía no coinciden con ninguna línea de la orden elegida: ${orphans.map((o) => o.description).filter(Boolean).join('; ')}.`
      : null);
  }, [doc.draft, purchaseOrderId, items, entryType]);

  const warningsFor = (field: string) => doc.draft?.warnings.filter((w) => w.field === field) ?? [];
  const flagFor = (field: string): FieldFlag => (aiFields[field] ? (warningsFor(field).length > 0 ? 'warn' : 'ai') : undefined);
  const messageFor = (field: string) => (aiFields[field] ? warningsFor(field)[0]?.message : undefined);
  const HEADER_FIELDS = ['delivery_note_series', 'delivery_note_number', 'delivery_note_date', 'supplier_id'];
  const generalWarnings = sortWarnings((doc.draft?.warnings ?? []).filter((w) => !w.field || !HEADER_FIELDS.includes(w.field)));

  // El bin_content_id real no existe hasta que el ingreso se crea — recién ahí se puede guardar la
  // escala/rotación que se eligió al ubicar (binService.updateContentPose, Fase A). El producto de cada
  // línea sale de la RESPUESTA del ingreso (receipt.items), no del estado local: para líneas de una
  // orden de compra, product_id puede no estar cargado del lado del frontend.
  const persistLocationPoses = async (receipt: GoodsReceipt) => {
    const rackCache = new Map<string, Awaited<ReturnType<typeof rackService.getRackById>>>();
    for (let i = 0; i < items.length; i++) {
      const productId = receipt.items?.[i]?.product ? Number(receipt.items[i].product!.product_id) : null;
      if (productId === null) continue;
      for (const loc of items[i].locations) {
        if (loc.scale === 1 && loc.rotationDeg === 0 && loc.orientation === 'pie') continue; // nunca se tocó, nada que guardar
        const key = `${loc.warehouseId}:${loc.rackId}`;
        let rack = rackCache.get(key);
        if (!rack) {
          try {
            rack = await rackService.getRackById(projectId, loc.warehouseId, loc.rackId);
            rackCache.set(key, rack);
          } catch {
            continue;
          }
        }
        const content = rack.bins?.find((b) => b.bin_id === loc.binId)?.contents?.find((c) => c.product_id === productId);
        if (!content) continue;
        try {
          await binService.updateContentPose(projectId, loc.warehouseId, loc.rackId, loc.binId, content.bin_content_id, {
            scale: loc.scale,
            rotation_x: loc.orientation === 'echado' ? Math.PI / 2 : 0,
            rotation_z: loc.orientation === 'lado' ? Math.PI / 2 : 0,
            rotation_y: (loc.rotationDeg * Math.PI) / 180,
          });
        } catch {
          // El ingreso ya quedó guardado — el tamaño/sentido se puede ajustar después a mano desde el estante.
        }
      }
    }
  };

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
      const fileId = await doc.ensureUploaded();
      const receipt = await goodsReceiptService.createGoodsReceipt(projectId, {
        supplier_id: Number(supplierId),
        entry_type: entryType,
        purchase_order_id: isFromOrder ? Number(purchaseOrderId) : null,
        delivery_note_series: deliveryNoteSeries.trim(),
        delivery_note_number: deliveryNoteNumber.trim(),
        delivery_note_date: deliveryNoteDate,
        received_date: receivedDate || undefined,
        items: payloadItems,
        file_id: fileId,
      });
      await persistLocationPoses(receipt);
      onCreated(receipt);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo registrar el ingreso.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <button onClick={onCancel} className="inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 mb-3">
        <ArrowLeft size={15} /> Volver a Ingresos
      </button>
      <h1 className="text-2xl font-bold text-gray-800">Nuevo ingreso</h1>
      <p className="text-sm text-gray-500 mb-4 max-w-2xl">Sube la guía de remisión a la derecha: la ves mientras llenas el formulario y, si quieres, la IA lee sus datos (lo recibido y las casillas los pones tú).</p>

      <DraftNotices warnings={generalWarnings} readNotes={doc.draft?.read_notes ?? []} />

      <div className={`flex flex-col @4xl:flex-row gap-4 items-start ${doc.reading || saving ? '[&>div:first-child]:pointer-events-none [&>div:first-child]:opacity-60' : ''}`}>
        <div className="w-full @4xl:flex-1 min-w-0 bg-white border border-gray-200 rounded-xl shadow-sm p-5">
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
            <div>
              <span className="text-[11px] text-gray-500 font-medium">Proveedor<span className="text-red-500"> *</span></span>
              <SupplierPicker
                projectId={projectId}
                selected={selectedSupplier}
                onSelect={chooseSupplier}
                flag={flagFor('supplier_id')}
                message={messageFor('supplier_id')}
                offer={doc.draft?.supplier.to_create ?? null}
              />
            </div>
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
            <Field label="Serie" required value={deliveryNoteSeries} onChange={editField('delivery_note_series', setDeliveryNoteSeries)} placeholder="T001" hint="1 a 4 letras o números" flag={flagFor('delivery_note_series')} message={messageFor('delivery_note_series')} />
            <Field label="Número" required value={deliveryNoteNumber} onChange={editField('delivery_note_number', setDeliveryNoteNumber)} placeholder="000451" hint="1 a 8 dígitos" flag={flagFor('delivery_note_number')} message={messageFor('delivery_note_number')} />
            <Field label="Fecha de guía" required type="date" value={deliveryNoteDate} onChange={editField('delivery_note_date', setDeliveryNoteDate)} flag={flagFor('delivery_note_date')} message={messageFor('delivery_note_date')} />
            <Field label="Fecha de recepción" type="date" value={receivedDate} onChange={setReceivedDate} hint="Opcional: si no, hoy" />
          </div>

          <p className="text-sm font-semibold text-gray-700 mt-5 mb-3">Ítems que llegan</p>
          {lineNote && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">{lineNote}</p>}
          <div className="space-y-4">
            {items.map((item, i) => {
              const product = isFromOrder ? null : getProduct(item.productId);
              const total = parseFloat(item.cantidad) || 0;
              const diff = total - sumLocations(item);
              return (
                <div key={i} className="border border-gray-100 rounded-lg p-3">
                  <div className="grid grid-cols-1 @sm:grid-cols-[1fr_8rem_8rem_auto] gap-2 items-end">
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
                        <button type="button" onClick={() => setCreatingProductFor(i)} className="block mt-1 text-[11px] font-medium text-[#0056b3] hover:underline">+ Crear producto</button>
                        {item.productId === '' && (item.candidates?.length ?? 0) > 0 && (
                          <span className="block mt-1 text-[11px] text-gray-500">
                            Posibles:{' '}
                            {item.candidates!.map((c) => {
                              const prod = products.find((p) => String(p.product_id) === String(c.product_id));
                              return prod ? (
                                <button key={c.product_id} type="button" onClick={() => updateItem(i, { productId: prod.product_id })} className="text-[#0056b3] hover:underline mr-2">{prod.code} — {prod.name}</button>
                              ) : null;
                            })}
                          </span>
                        )}
                      </label>
                    )}
                    <Field
                      label={`Cantidad recibida${product ? ` (${product.unit})` : isFromOrder && item.unit ? ` (${item.unit})` : ''}`}
                      value={item.cantidad}
                      onChange={(v) => updateItem(i, { cantidad: v })}
                    />
                    <Field
                      label="Según guía"
                      value={item.quantityPerNote}
                      onChange={(v) => updateItem(i, { quantityPerNote: v, ai: false })}
                      flag={item.ai ? 'ai' : undefined}
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

        <div className="w-full @4xl:w-[26rem] flex-shrink-0 space-y-4">
          <DocumentPanel doc={doc} disabled={saving} onRead={() => { doc.read(); }} />
          {items.map((item, i) => {
            const previewProduct = getProduct(item.productId);
            if (previewProduct?.model_3d_asset_id == null) return null;
            return (
              <div key={i} className="bg-white border border-gray-200 rounded-xl shadow-sm p-4">
                <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 truncate">
                  {previewProduct.code} — {previewProduct.name}
                </p>
                <InlineModelPreview projectId={projectId} assetId={previewProduct.model_3d_asset_id} className="w-full h-80" />
              </div>
            );
          })}
        </div>
      </div>

      {creatingProductFor !== null && (
        <CreateProductModal
          projectId={projectId}
          onClose={() => setCreatingProductFor(null)}
          onCreated={(product) => {
            setProducts((prev) => [...prev, product]);
            updateItem(creatingProductFor, { productId: product.product_id });
            setCreatingProductFor(null);
          }}
        />
      )}

      {ciudadItemIndex !== null && (
        <CiudadModal
          projectId={projectId}
          onClose={() => setCiudadItemIndex(null)}
          pickMode={{
            itemLabel: (isFromOrder ? items[ciudadItemIndex]?.productLabel : getProduct(items[ciudadItemIndex]?.productId)?.name) || 'este ítem',
            itemModelPath: getProduct(items[ciudadItemIndex]?.productId)?.model_3d_url,
            onConfirm: (bin) => addLocation(ciudadItemIndex, bin),
            onFillAll: (bins) => addLocations(ciudadItemIndex, bins),
          }}
        />
      )}
    </div>
  );
};

export default NuevoIngreso;
