import React, { useEffect, useRef, useState } from 'react';
import { ScanLine, Upload, Plus, Trash2, MapPin, X } from 'lucide-react';
import MiniIfcViewer from '../../components/MiniIfcViewer';
import CiudadModal from '../../components/CiudadModal';
import { productService } from '../../../../services/almacen/product.service';
import { goodsReceiptService } from '../../../../services/almacen/goodsReceipt.service';
import { GoodsReceipt, Product } from '../../../../types/almacen.types';

interface ItemLocation { binId: number; label: string; quantity: string; }
interface ItemRow { productId: number | ''; cantidad: string; locations: ItemLocation[]; }

const emptyItem = (): ItemRow => ({ productId: '', cantidad: '', locations: [] });

const Field: React.FC<{
  label: string; value?: string; onChange?: (v: string) => void; type?: string; className?: string;
}> = ({ label, value, onChange, type = 'text', className }) => (
  <label className={`block ${className || ''}`}>
    <span className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</span>
    <input
      type={type}
      value={value}
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
  const [supplierRuc, setSupplierRuc] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [ciudadItemIndex, setCiudadItemIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ifcFile, setIfcFile] = useState<File | null>(null);

  // Siempre trae el catálogo fresco al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    productService.getProducts(projectId).then(setProducts).catch(() => setProducts([]));
  }, [projectId]);

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
    const ruc = supplierRuc.replace(/[\s-]/g, '');
    if (!/^\d{11}$/.test(ruc)) {
      window.alert('El RUC debe tener exactamente 11 dígitos (formato SUNAT).');
      return;
    }
    if (!supplierName.trim()) { window.alert('Falta el nombre del proveedor.'); return; }
    if (!deliveryNote.trim()) { window.alert('Falta el número de guía de remisión.'); return; }

    const payloadItems = [];
    for (const item of items) {
      if (!item.productId) { window.alert('Todos los ítems necesitan un producto.'); return; }
      const total = parseFloat(item.cantidad);
      if (!total || total <= 0) { window.alert('La cantidad del ítem tiene que ser mayor a 0.'); return; }
      if (item.locations.length === 0) { window.alert('Cada ítem necesita al menos una ubicación.'); return; }
      const sum = sumLocations(item);
      if (Math.abs(sum - total) > 1e-6) {
        window.alert(`La suma de las cantidades por ubicación (${sum}) tiene que ser igual a la cantidad total del ítem (${total}).`);
        return;
      }
      payloadItems.push({
        product_id: item.productId,
        total_quantity: total,
        locations: item.locations.map((l) => ({ bin_id: l.binId, quantity: parseFloat(l.quantity) || 0 })),
      });
    }

    setSaving(true);
    try {
      const receipt = await goodsReceiptService.createGoodsReceipt(projectId, {
        supplier_ruc: ruc,
        supplier_name: supplierName.trim(),
        delivery_note_number: deliveryNote.trim(),
        purchase_date: purchaseDate,
        items: payloadItems,
      });
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
          <p className="text-sm font-semibold text-gray-700 mb-3">Datos de la compra</p>
          <div className="grid grid-cols-1 @sm:grid-cols-4 gap-3 mb-4">
            <Field label="RUC proveedor" value={supplierRuc} onChange={setSupplierRuc} />
            <Field label="Nombre proveedor" value={supplierName} onChange={setSupplierName} />
            <Field label="N° guía de remisión" value={deliveryNote} onChange={setDeliveryNote} />
            <Field label="Fecha de compra" type="date" value={purchaseDate} onChange={setPurchaseDate} />
          </div>

          <p className="text-sm font-semibold text-gray-700 mt-5 mb-3">Ítems que llegan</p>
          <div className="space-y-4">
            {items.map((item, i) => {
              const product = getProduct(item.productId);
              const total = parseFloat(item.cantidad) || 0;
              const diff = total - sumLocations(item);
              return (
                <div key={i} className="border border-gray-100 rounded-lg p-3">
                  <div className="grid grid-cols-1 @sm:grid-cols-[1fr_8rem_auto] gap-2 items-end">
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
                    <Field
                      label={`Cantidad total${product ? ` (${product.unit})` : ''}`}
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
          <button onClick={addItem} className="flex items-center gap-1.5 text-sm text-[#0056b3] font-medium mt-3">
            <Plus size={15} /> Agregar ítem
          </button>

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

        <div className="w-full @xl:w-96 flex-shrink-0 flex flex-col bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1 flex-1">
              <ScanLine size={13} className="text-gray-400" />
              <input placeholder="Escanear código" className="bg-transparent text-xs outline-none flex-1 placeholder-gray-400" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ifc"
              className="hidden"
              onChange={(e) => setIfcFile(e.target.files?.[0] ?? null)}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 bg-[#0056b3] text-white rounded-lg px-2.5 py-1 text-xs font-medium hover:bg-[#004494] transition-colors flex-shrink-0"
            >
              <Upload size={12} /> Cargar IFC
            </button>
          </div>

          <div className="flex-1 min-h-64 mb-4">
            <MiniIfcViewer file={ifcFile} />
          </div>
        </div>
      </div>

      {ciudadItemIndex !== null && (
        <CiudadModal
          projectId={projectId}
          onClose={() => setCiudadItemIndex(null)}
          pickMode={{
            itemLabel: getProduct(items[ciudadItemIndex]?.productId)?.name || 'este ítem',
            itemModelPath: getProduct(items[ciudadItemIndex]?.productId)?.model_3d_path,
            onConfirm: (bin) => addLocation(ciudadItemIndex, { binId: bin.binId, label: bin.label }),
          }}
        />
      )}
    </div>
  );
};

export default NuevoIngreso;
