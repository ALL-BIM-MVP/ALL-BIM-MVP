import React, { useEffect, useState } from 'react';
import { locationHistoryService } from '../../../services/almacen/locationHistory.service';
import { LocationHistoryResponse, LocationMovement } from '../../../types/almacen.types';
import { trimNumeric } from '../../../utils/numberFormat';

interface BinTraceProps {
  projectId: number;
  warehouseId: number;
  rackId: number;
  binId: number;
}

const DOC_KIND: Record<LocationMovement['document']['type'], string> = {
  goods_receipt: 'Ingreso',
  goods_issue: 'Vale de salida',
  inventory_adjustment: 'Ajuste',
};

const formatDate = (iso: string) => iso.split('-').reverse().join('/');

/** Línea de tiempo de una casilla: cada ingreso, vale o ajuste que pasó por ahí, con su saldo. */
const BinTrace: React.FC<BinTraceProps> = ({ projectId, warehouseId, rackId, binId }) => {
  const [data, setData] = useState<LocationHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setData(null);
    locationHistoryService
      .getBinHistory(projectId, warehouseId, rackId, binId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, warehouseId, rackId, binId]);

  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-gray-700 mb-2">Trazabilidad</p>
      {loading && <p className="text-xs text-gray-400">Cargando...</p>}
      {failed && <p className="text-xs text-red-500">No se pudo cargar la trazabilidad.</p>}
      {data && data.items.length === 0 && <p className="text-xs text-gray-400">Esta casilla no tiene movimientos.</p>}
      {data && data.items.length > 0 && (
        <ol className="relative border-l border-gray-200 ml-1.5 space-y-3">
          {data.items.map((m, i) => {
            const isIn = m.type === 'entrada';
            const who = m.supplier?.name ?? (m.destination ? `${m.destination}${m.recipient_name ? ` · retiró ${m.recipient_name}` : ''}` : null);
            return (
              <li key={i} className="ml-3">
                <span className={`absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full border-2 border-white ${isIn ? 'bg-green-500' : 'bg-red-400'}`} />
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-xs font-bold ${isIn ? 'text-green-700' : 'text-red-600'}`}>
                    {isIn ? '+' : '−'}{trimNumeric(m.quantity)} {m.product.unit}
                  </span>
                  <span className="text-[11px] text-gray-400">{formatDate(m.date)}</span>
                </div>
                <p className="text-xs text-gray-700">{m.product.code} — {m.product.name}</p>
                <p className="text-[11px] text-gray-500">
                  {DOC_KIND[m.document.type]} {m.document.label}
                  {m.entry_type === 'rapida' && ' (entrada rápida)'}
                </p>
                {who && <p className="text-[11px] text-gray-400">{who}</p>}
                {m.reason && (
                  <p className="text-[11px] text-amber-600">
                    {m.reason}{m.adjusted_document ? ` · sobre ${m.adjusted_document.label}` : ''}
                  </p>
                )}
                <p className="text-[11px] text-gray-400">Saldo del producto: {trimNumeric(m.balance_after)}</p>
              </li>
            );
          })}
        </ol>
      )}
      {data?.truncated && <p className="text-[11px] text-gray-400 mt-2">Se muestran solo los movimientos más recientes.</p>}
    </div>
  );
};

export default BinTrace;
