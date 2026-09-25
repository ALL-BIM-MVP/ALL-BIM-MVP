import React, { useEffect, useState } from 'react';
import { inventoryAdjustmentService } from '../../../../services/almacen/inventoryAdjustment.service';
import { InventoryAdjustment, InventoryAdjustmentKind } from '../../../../types/almacen.types';

interface AjustesProps {
  projectId: number;
}

const Ajustes: React.FC<AjustesProps> = ({ projectId }) => {
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [kind, setKind] = useState<InventoryAdjustmentKind | ''>('');
  const [loading, setLoading] = useState(false);

  const load = (k?: InventoryAdjustmentKind) => {
    setLoading(true);
    inventoryAdjustmentService
      .getAdjustments(projectId, { kind: k || undefined })
      .then(setAdjustments)
      .catch(() => setAdjustments([]))
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
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Ajustes</h1>
      <p className="text-sm text-gray-400 mb-4">
        Correcciones y anulaciones de ingresos y vales ya registrados — el original nunca se reescribe, cada ajuste es un documento aparte.
      </p>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <label className="block mb-3">
          <span className="text-[11px] text-gray-400 uppercase tracking-wide">Tipo</span>
          <select
            value={kind}
            onChange={(e) => {
              const value = e.target.value as InventoryAdjustmentKind | '';
              setKind(value);
              load(value || undefined);
            }}
            className="w-full max-w-xs mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
          >
            <option value="">Todos</option>
            <option value="correccion">Correcciones</option>
            <option value="anulacion">Anulaciones</option>
          </select>
        </label>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 font-medium">Tipo</th>
              <th className="py-2 font-medium">Documento</th>
              <th className="py-2 font-medium">Motivo</th>
              <th className="py-2 font-medium">Fecha</th>
              <th className="py-2 font-medium">Líneas</th>
            </tr>
          </thead>
          <tbody>
            {!loading && adjustments.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-300">Sin ajustes todavía</td>
              </tr>
            )}
            {adjustments.map((a) => (
              <tr key={a.inventory_adjustment_id} className="border-b border-gray-50">
                <td className="py-2">
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${a.kind === 'anulacion' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                    {a.kind === 'anulacion' ? 'Anulación' : 'Corrección'}
                  </span>
                </td>
                <td className="py-2 text-gray-700">
                  {a.reference_document.type === 'goods_receipt' ? 'Ingreso' : 'Vale'} {a.reference_document.label}
                </td>
                <td className="py-2 text-gray-600 max-w-xs truncate">{a.reason}</td>
                <td className="py-2 text-gray-500">{a.adjustment_date}</td>
                <td className="py-2 text-gray-500">{a.items.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Ajustes;
