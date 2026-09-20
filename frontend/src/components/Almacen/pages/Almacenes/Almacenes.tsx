import React, { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import CiudadModal from '../../components/CiudadModal';
import { warehouseService } from '../../../../services/almacen/warehouse.service';
import { Warehouse } from '../../../../types/almacen.types';

interface AlmacenesProps {
  projectId: number;
}

const Almacenes: React.FC<AlmacenesProps> = ({ projectId }) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCiudad, setShowCiudad] = useState(false);

  const load = () => {
    setLoading(true);
    warehouseService
      .getWarehouses(projectId)
      .then(setWarehouses)
      .catch(() => setWarehouses([]))
      .finally(() => setLoading(false));
  };

  // Siempre trae datos frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Almacenes</h1>
          </div>
          <button
            onClick={() => setShowCiudad(true)}
            className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors"
          >
            <Building2 size={15} /> Abrir Almacenes
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 font-medium">Nombre</th>
              <th className="py-2 font-medium">Puerta</th>
              <th className="py-2 font-medium">Área</th>
              <th className="py-2 font-medium">Grilla interior</th>
              <th className="py-2 font-medium">Creado</th>
            </tr>
          </thead>
          <tbody>
            {!loading && warehouses.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-300">Sin almacenes todavía</td>
              </tr>
            )}
            {warehouses.map((w) => (
              <tr key={w.warehouse_id} className="border-b border-gray-50">
                <td className="py-2 font-semibold text-gray-800">{w.name}</td>
                <td className="py-2 text-gray-500">{w.direction}</td>
                <td className="py-2 text-gray-700">{w.area_m2.toFixed(1)} m²</td>
                <td className="py-2 text-gray-700">{w.grid_width} × {w.grid_depth} cubos</td>
                <td className="py-2 text-gray-400">{new Date(w.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-4">
          Para crear un almacén nuevo, moverlo, rotarlo o entrar a armar sus estantes, usá "Abrir Almacenes".
        </p>
      </div>

      {showCiudad && (
        <CiudadModal
          projectId={projectId}
          onClose={() => {
            setShowCiudad(false);
            load();
          }}
        />
      )}
    </div>
  );
};

export default Almacenes;
