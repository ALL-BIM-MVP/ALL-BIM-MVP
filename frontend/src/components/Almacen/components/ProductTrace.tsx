import React, { useEffect, useState } from 'react';
import { productService } from '../../../services/almacen/product.service';
import { ProductHistoryItem, ProductHistoryResponse } from '../../../types/almacen.types';
import { trimNumeric } from '../../../utils/numberFormat';

interface ProductTraceProps {
  projectId: number;
  productId: number;
}

const formatDate = (iso: string) => iso.split('-').reverse().join('/');

/** Recorrido completo del producto en todo el almacén (endpoint de la hoja de vida del producto,
 * Fase 9) — a diferencia de BinTrace, no se limita a la casilla seleccionada. */
const ProductTrace: React.FC<ProductTraceProps> = ({ projectId, productId }) => {
  const [data, setData] = useState<ProductHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setData(null);
    productService
      .getProductHistory(projectId, productId)
      .then((res) => { if (!cancelled) setData(res); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, productId]);

  const describe = (item: ProductHistoryItem) => {
    if (item.type === 'entrada') {
      return {
        label: item.receipt ? `Ingreso ${item.receipt.label}` : 'Ingreso (sin guía todavía)',
        who: item.receipt?.supplier.name ?? null,
        qty: item.quantity_effective ?? item.quantity_registered,
      };
    }
    return {
      label: `Vale ${item.issue.number}`,
      who: `${[item.issue.destination_sector, item.issue.destination_level, item.issue.destination_block].filter(Boolean).join(' / ')} · retiró ${item.issue.recipient_name}`,
      qty: item.quantity_effective,
    };
  };

  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-gray-700 mb-2">Trazabilidad del producto</p>
      {loading && <p className="text-xs text-gray-400">Cargando...</p>}
      {failed && <p className="text-xs text-red-500">No se pudo cargar la trazabilidad.</p>}
      {data && (
        <p className="text-[11px] text-gray-500 mb-2">Stock total: {trimNumeric(data.stock.total)} {data.product.unit}</p>
      )}
      {data && data.items.length === 0 && <p className="text-xs text-gray-400">Este producto todavía no tiene movimientos.</p>}
      {data && data.items.length > 0 && (
        <ol className="relative border-l border-gray-200 ml-1.5 space-y-3">
          {data.items.map((item, i) => {
            const isIn = item.type === 'entrada';
            const { label, who, qty } = describe(item);
            return (
              <li key={i} className="ml-3">
                <span className={`absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full border-2 border-white ${isIn ? 'bg-green-500' : 'bg-red-400'}`} />
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-xs font-bold ${isIn ? 'text-green-700' : 'text-red-600'}`}>
                    {isIn ? '+' : '−'}{trimNumeric(qty ?? '0')} {data.product.unit}
                  </span>
                  <span className="text-[11px] text-gray-400">{formatDate(item.date)}</span>
                </div>
                <p className="text-xs text-gray-700">
                  {label}
                  {item.voided && <span className="ml-1 text-red-500">(anulado)</span>}
                </p>
                {who && <p className="text-[11px] text-gray-400">{who}</p>}
                {item.locations.length > 0 && (
                  <p className="text-[11px] text-gray-500">
                    {item.locations.map((l) => `${l.label} · ${trimNumeric(l.quantity)}`).join(' — ')}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {data?.truncated && <p className="text-[11px] text-gray-400 mt-2">Se muestran solo los movimientos más recientes.</p>}
    </div>
  );
};

export default ProductTrace;
