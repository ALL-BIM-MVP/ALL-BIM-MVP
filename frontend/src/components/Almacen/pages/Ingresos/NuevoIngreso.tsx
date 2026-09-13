import React, { useRef, useState } from 'react';
import { ScanLine, Upload, Plus, Trash2, MapPin, Box } from 'lucide-react';
import MiniIfcViewer from '../../components/MiniIfcViewer';
import CiudadModal from '../../components/CiudadModal';

interface ItemRow { elemento: string; cantidad: string; unidad: string; ubicacion?: string; glbFile?: File | null; }

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

const NuevoIngreso: React.FC = () => {
  const [items, setItems] = useState<ItemRow[]>([{ elemento: '', cantidad: '', unidad: '' }]);

  const updateItem = (i: number, field: keyof ItemRow, value: string) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  };
  const setItemGlbFile = (i: number, file: File | null) => {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, glbFile: file } : it)));
  };
  const addItem = () => setItems((prev) => [...prev, { elemento: '', cantidad: '', unidad: '' }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [ifcFile, setIfcFile] = useState<File | null>(null);
  const [ciudadItemIndex, setCiudadItemIndex] = useState<number | null>(null);
  const glbInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Ingreso de materiales</h1>

      <div className="flex flex-col @xl:flex-row gap-4 items-stretch">
        <div className="w-full @xl:flex-1 @xl:max-w-3xl bg-white border border-gray-200 rounded-xl shadow-sm p-5">
          <p className="text-sm font-semibold text-gray-700 mb-3">Datos de la compra</p>
          <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3 mb-4">
            <Field label="RUC proveedor" />
            <Field label="N° guía de remisión" />
            <Field label="Fecha" type="date" />
          </div>
          <Field label="Orden de compra relacionada (opcional)" />

          <p className="text-sm font-semibold text-gray-700 mt-5 mb-3">Ítems que llegan</p>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-1 @sm:grid-cols-[1fr_6rem_5rem_auto_auto_auto] gap-2 items-end">
                <Field label="Elemento" value={item.elemento} onChange={(v) => updateItem(i, 'elemento', v)} />
                <Field label="Cantidad" value={item.cantidad} onChange={(v) => updateItem(i, 'cantidad', v)} />
                <Field label="Unidad" value={item.unidad} onChange={(v) => updateItem(i, 'unidad', v)} />
                <input
                  ref={(el) => { glbInputRefs.current[i] = el; }}
                  type="file"
                  accept=".glb"
                  className="hidden"
                  onChange={(e) => setItemGlbFile(i, e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => glbInputRefs.current[i]?.click()}
                  title={item.glbFile ? item.glbFile.name : 'Cargar modelo GLB de este ítem'}
                  className={`flex items-center gap-1.5 text-xs font-medium border rounded-lg px-2.5 py-1.5 transition-colors mb-0.5 ${
                    item.glbFile ? 'border-[#0056b3]/30 bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Box size={14} className="flex-shrink-0" /> GLB
                </button>
                <button
                  onClick={() => setCiudadItemIndex(i)}
                  title={item.ubicacion}
                  className={`flex items-center gap-1.5 text-xs font-medium border rounded-lg px-2.5 py-1.5 transition-colors mb-0.5 max-w-full ${
                    item.ubicacion ? 'border-[#0056b3]/30 bg-blue-50 text-[#0056b3]' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <MapPin size={14} className="flex-shrink-0" />
                  <span className="truncate">{item.ubicacion ?? 'Elegir ubicación'}</span>
                </button>
                <button
                  onClick={() => removeItem(i)}
                  disabled={items.length === 1}
                  className="text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300 pb-2"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addItem} className="flex items-center gap-1.5 text-sm text-[#0056b3] font-medium mt-3">
            <Plus size={15} /> Agregar ítem
          </button>

          <label className="block mt-5">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Comentario</span>
            <textarea
              rows={2}
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] resize-none"
            />
          </label>

          <div className="flex justify-end">
            <button className="mt-6 px-8 bg-[#0056b3] text-white rounded-lg py-2.5 font-semibold hover:bg-[#004494] transition-colors">
              Registrar ingreso
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

          <p className="text-sm font-semibold text-gray-700 mb-2">Detalle del ingreso</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 text-left border-b border-gray-100">
                <th className="py-1.5 font-medium">Código</th>
                <th className="py-1.5 font-medium">Cant.</th>
                <th className="py-1.5 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="text-center text-gray-300">
                <td colSpan={3} className="py-6">Sin ítems todavía</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {ciudadItemIndex !== null && (
        <CiudadModal
          onClose={() => setCiudadItemIndex(null)}
          pickMode={{
            itemLabel: items[ciudadItemIndex]?.elemento || 'este ítem',
            itemGlbFile: items[ciudadItemIndex]?.glbFile,
            onConfirm: (ubicacion) => updateItem(ciudadItemIndex, 'ubicacion', ubicacion),
          }}
        />
      )}
    </div>
  );
};

export default NuevoIngreso;
