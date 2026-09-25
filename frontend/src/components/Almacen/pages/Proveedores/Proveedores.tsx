import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { supplierService } from '../../../../services/almacen/supplier.service';
import { Supplier } from '../../../../types/almacen.types';

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

interface ProveedoresProps {
  projectId: number;
}

const Proveedores: React.FC<ProveedoresProps> = ({ projectId }) => {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [formRuc, setFormRuc] = useState('');
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = (term?: string) => {
    setLoading(true);
    supplierService
      .getSuppliers(projectId, term)
      .then(setSuppliers)
      .catch(() => setSuppliers([]))
      .finally(() => setLoading(false));
  };

  // Siempre trae datos frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const createSupplier = async () => {
    if (!formRuc.trim() || !formName.trim()) return;
    setSaving(true);
    try {
      await supplierService.createSupplier(projectId, { ruc: formRuc.trim(), name: formName.trim() });
      setShowCreate(false);
      setFormRuc('');
      setFormName('');
      load(search);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo crear el proveedor.');
    } finally {
      setSaving(false);
    }
  };

  const removeSupplier = async (supplier: Supplier) => {
    if (!window.confirm(`¿Eliminar "${supplier.name}"?`)) return;
    try {
      await supplierService.deleteSupplier(projectId, supplier.supplier_id);
      load(search);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo eliminar el proveedor.');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Proveedores</h1>
          <p className="text-sm text-gray-400">Se buscan por RUC o nombre. El RUC queda bloqueado cuando el proveedor ya tiene documentos.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors"
        >
          <Plus size={15} /> Nuevo proveedor
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <label className="block mb-3">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Buscar</span>
          <div className="flex gap-2 mt-1">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="RUC o nombre..."
              className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            />
            <button
              onClick={() => load(search)}
              className="border border-gray-200 rounded-lg px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Buscar
            </button>
          </div>
        </label>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 font-medium">Proveedor</th>
              <th className="py-2 font-medium">RUC</th>
              <th className="py-2 font-medium">Documentos</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {!loading && suppliers.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-gray-300">No hay proveedores.</td>
              </tr>
            )}
            {suppliers.map((s) => (
              <tr key={s.supplier_id} className="border-b border-gray-50">
                <td className="py-2 font-semibold text-gray-800">{s.name}</td>
                <td className="py-2 font-mono text-xs text-gray-500">{s.ruc}</td>
                <td className="py-2 text-gray-500">{s.documents_count}</td>
                <td className="py-2 text-right">
                  <button onClick={() => removeSupplier(s)} className="text-gray-300 hover:text-red-500" title="Eliminar">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Nuevo proveedor</h3>
            <Field label="RUC (11 dígitos)" value={formRuc} onChange={setFormRuc} placeholder="20456789123" className="mb-3" />
            <Field label="Nombre" value={formName} onChange={setFormName} placeholder="ej. Ferretería XYZ" className="mb-4" />
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={createSupplier} disabled={saving} className="flex-1 bg-[#0056b3] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[#004494] disabled:opacity-50">
                {saving ? 'Creando...' : 'Crear proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Proveedores;
