import React, { useState } from 'react';
import SearchCombobox from './SearchCombobox';
import { Field, FieldFlag, flagClass } from './FormField';
import { supplierService } from '../../../services/almacen/supplier.service';
import { Supplier } from '../../../types/almacen.types';

interface SupplierPickerProps {
  projectId: number;
  selected: Supplier | null;
  onSelect: (supplier: Supplier | null) => void;
  flag?: FieldFlag;
  message?: string;
  // Proveedor leído por la IA que todavía no existe en el proyecto: se ofrece crearlo ya rellenado.
  offer?: { ruc: string; name: string } | null;
}

/** Proveedor con búsqueda (nombre o RUC) y "+ Crear proveedor" sin salir de la pantalla. */
const SupplierPicker: React.FC<SupplierPickerProps> = ({ projectId, selected, onSelect, flag, message, offer }) => {
  const [creating, setCreating] = useState(false);
  const [ruc, setRuc] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const openCreate = (prefill?: { ruc: string; name: string } | null) => {
    setRuc(prefill?.ruc ?? '');
    setName(prefill?.name ?? '');
    setCreating(true);
  };

  const create = async () => {
    if (!ruc.trim() || !name.trim()) return;
    setSaving(true);
    try {
      const created = await supplierService.createSupplier(projectId, { ruc: ruc.trim(), name: name.trim() });
      onSelect(created);
      setCreating(false);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo crear el proveedor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div>
        <SearchCombobox<Supplier>
          selected={selected}
          onSelect={onSelect}
          search={(term) => supplierService.getSuppliers(projectId, term || undefined)}
          getId={(s) => s.supplier_id}
          getLabel={(s) => s.name}
          getSubLabel={(s) => s.ruc}
          placeholder="Buscar por nombre o RUC…"
          inputClassName={flagClass(flag)}
          footer={(
            <button type="button" onClick={() => openCreate(offer)} className="text-xs font-medium text-[#0056b3] hover:underline">
              + Crear proveedor
            </button>
          )}
        />
      </div>
      {!selected && (
        <p className="mt-1.5 inline-block text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">Sin vincular: busca y elige un registro de la lista.</p>
      )}
      {!selected && offer && (
        <p className="mt-1.5 text-[11px] text-gray-500">
          La IA leyó <span className="font-medium">{offer.name}</span> (RUC {offer.ruc}), que no existe en este proyecto.{' '}
          <button type="button" onClick={() => openCreate(offer)} className="text-[#0056b3] hover:underline">Crearlo</button>
        </p>
      )}
      {message && <span className="block text-[11px] text-amber-600 mt-0.5">{message}</span>}
      {!selected && !offer && (
        <button type="button" onClick={() => openCreate(null)} className="block mt-1 text-[11px] font-medium text-[#0056b3] hover:underline">+ Crear proveedor</button>
      )}

      {creating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Nuevo proveedor</h3>
            <Field label="RUC (11 dígitos)" value={ruc} onChange={setRuc} placeholder="20456789123" className="mb-3" />
            <Field label="Nombre" value={name} onChange={setName} placeholder="ej. Ferretería XYZ" className="mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setCreating(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button onClick={create} disabled={saving} className="flex-1 bg-[#0056b3] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[#004494] disabled:opacity-50">
                {saving ? 'Creando...' : 'Crear proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierPicker;
