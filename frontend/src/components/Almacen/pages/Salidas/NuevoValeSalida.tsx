import React, { useEffect, useState } from 'react';
import { Plus, Trash2, MapPin, X } from 'lucide-react';
import CiudadModal from '../../components/CiudadModal';
import { productService } from '../../../../services/almacen/product.service';
import { goodsIssueService } from '../../../../services/almacen/goodsIssue.service';
import { GoodsIssue, Product } from '../../../../types/almacen.types';

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

interface NuevoValeSalidaProps {
  projectId: number;
  onCreated: (issue: GoodsIssue) => void;
  onCancel: () => void;
}

const NuevoValeSalida: React.FC<NuevoValeSalidaProps> = ({ projectId, onCreated, onCancel }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [sector, setSector] = useState('');
  const [nivel, setNivel] = useState('');
  const [bloque, setBloque] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recipientName, setRecipientName] = useState('');
  const [recipientDni, setRecipientDni] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyItem()]);
  const [ciudadItemIndex, setCiudadItemIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

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
    const dni = recipientDni.replace(/[\s-]/g, '');
    if (!/^\d{8}$/.test(dni)) { window.alert('El DNI debe tener exactamente 8 dígitos.'); return; }
    if (!recipientName.trim()) { window.alert('Falta el nombre de quien retira.'); return; }
    if (!sector.trim() || !nivel.trim() || !bloque.trim()) { window.alert('Completá sector, nivel y bloque del destino.'); return; }

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
      const issue = await goodsIssueService.createGoodsIssue(projectId, {
        destination_sector: sector.trim(),
        destination_level: nivel.trim(),
        destination_block: bloque.trim(),
        recipient_name: recipientName.trim(),
        recipient_dni: dni,
        issue_date: issueDate,
        items: payloadItems,
      });
      onCreated(issue);
    } catch (err) {
      // INSUFFICIENT_STOCK entre otros errores del backend — mensaje ya legible, se muestra tal cual.
      window.alert(err instanceof Error ? err.message : 'No se pudo registrar el vale de salida.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <button onClick={onCancel} className="text-sm text-[#0056b3] font-medium mb-3">← Volver a Vales de salida</button>
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Nuevo vale de salida</h1>

      <div className="max-w-5xl">
        <div className="grid grid-cols-1 @lg:grid-cols-2 gap-4 mb-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Destino en obra</p>
            <div className="grid grid-cols-2 @sm:grid-cols-4 @lg:grid-cols-2 gap-3">
              <Field label="Sector" value={sector} onChange={setSector} />
              <Field label="Nivel" value={nivel} onChange={setNivel} />
              <Field label="Bloque" value={bloque} onChange={setBloque} />
              <Field label="Fecha de salida" type="date" value={issueDate} onChange={setIssueDate} />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
            <p className="text-sm font-semibold text-gray-700 mb-3">Quién retira (texto libre, no es un usuario del sistema)</p>
            <div className="grid grid-cols-1 @sm:grid-cols-2 gap-3">
              <Field label="Nombre" value={recipientName} onChange={setRecipientName} />
              <Field label="DNI" value={recipientDni} onChange={setRecipientDni} />
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Ítems que salen</p>
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
        </div>

        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={saving}
            className="mt-6 px-8 bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50"
          >
            {saving ? 'Registrando...' : 'Confirmar salida'}
          </button>
        </div>
      </div>

      {ciudadItemIndex !== null && (
        <CiudadModal
          projectId={projectId}
          onClose={() => setCiudadItemIndex(null)}
          pickMode={{
            itemLabel: getProduct(items[ciudadItemIndex]?.productId)?.name || 'este ítem',
            onConfirm: (bin) => addLocation(ciudadItemIndex, { binId: bin.binId, label: bin.label }),
          }}
        />
      )}
    </div>
  );
};

export default NuevoValeSalida;
