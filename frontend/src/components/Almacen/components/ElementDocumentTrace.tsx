import React, { useEffect, useState } from 'react';
import { locationHistoryService } from '../../../services/almacen/locationHistory.service';
import { traceabilityService } from '../../../services/almacen/traceability.service';
import { TraceabilityDocumentRef, TraceabilityResponse } from '../../../types/almacen.types';
import { trimNumeric } from '../../../utils/numberFormat';

interface ElementDocumentTraceProps {
  projectId: number;
  warehouseId: number;
  rackId: number;
  binId: number;
  productId: number;
}

/** Recorrido de documentos (requerimiento → cotización → orden → factura → ingreso) del producto
 * puesto en esta casilla — mismo motor que la página "Trazabilidad", anclado en el ingreso que lo
 * trajo (se busca en el historial de la casilla, no lo elige el usuario). */
const ElementDocumentTrace: React.FC<ElementDocumentTraceProps> = ({ projectId, warehouseId, rackId, binId, productId }) => {
  const [data, setData] = useState<TraceabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [noReceipt, setNoReceipt] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setNoReceipt(false);
    setData(null);
    locationHistoryService
      .getBinHistory(projectId, warehouseId, rackId, binId)
      .then((history) => {
        const receipt = history.items.find((m) => m.document.type === 'goods_receipt' && String(m.product.product_id) === String(productId));
        if (!receipt) {
          if (!cancelled) setNoReceipt(true);
          return null;
        }
        return traceabilityService.getTraceability(projectId, 'goods-receipt', String(receipt.document.id), 'backward');
      })
      .then((res) => { if (res && !cancelled) setData(res); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, warehouseId, rackId, binId, productId]);

  const labelOf = (list: TraceabilityDocumentRef[], docId: string) => list.find((d) => d.id === docId)?.label ?? docId;
  const thread = data?.threads.find((t) => String(t.product.product_id) === String(productId));

  return (
    <div className="mb-3">
      <p className="text-xs font-semibold text-gray-700 mb-2">Recorrido de documentos</p>
      {loading && <p className="text-xs text-gray-400">Cargando...</p>}
      {failed && <p className="text-xs text-red-500">No se pudo cargar el recorrido.</p>}
      {noReceipt && <p className="text-xs text-gray-400">No se encontró un ingreso que haya traído este producto a esta casilla.</p>}
      {data && !thread && <p className="text-xs text-gray-400">Sin documentos conectados.</p>}
      {thread && (
        <div className="grid grid-cols-2 gap-2.5 text-[11px]">
          <div>
            <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Requerimiento</p>
            {thread.requisition_items.length === 0 && <p className="text-gray-300 italic">—</p>}
            {thread.requisition_items.map((it) => (
              <div key={it.id} className="mb-1 pb-1 border-b border-gray-50 last:border-0">
                <p className="text-gray-700">{labelOf(data!.documents.requisitions, it.document_id)}</p>
                <p className="text-gray-400">{trimNumeric(it.quantity_requested)}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Cotizaciones</p>
            {thread.quotation_items.length === 0 && <p className="text-gray-300 italic">—</p>}
            {thread.quotation_items.map((it) => (
              <div key={it.id} className="mb-1 pb-1 border-b border-gray-50 last:border-0">
                <p className="text-gray-700">{labelOf(data!.documents.quotations, it.document_id)}</p>
                <p className="text-gray-400">{trimNumeric(it.quantity_quoted)}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Órdenes</p>
            {thread.purchase_order_items.length === 0 && <p className="text-gray-300 italic">—</p>}
            {thread.purchase_order_items.map((it) => (
              <div key={it.id} className="mb-1 pb-1 border-b border-gray-50 last:border-0">
                <p className="text-gray-700">{labelOf(data!.documents.purchase_orders, it.document_id)}</p>
                <p className="text-gray-400">{trimNumeric(it.quantity_ordered)}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Facturas</p>
            {thread.invoice_items.length === 0 && <p className="text-gray-300 italic">—</p>}
            {thread.invoice_items.map((it) => (
              <div key={it.id} className="mb-1 pb-1 border-b border-gray-50 last:border-0">
                <p className="text-gray-700">{labelOf(data!.documents.invoices, it.document_id)}</p>
                <p className="text-gray-400">{trimNumeric(it.quantity_invoiced)}</p>
              </div>
            ))}
          </div>
          <div className="col-span-2">
            <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1">Ingresos</p>
            {thread.receipt_items.length === 0 && <p className="text-gray-300 italic">—</p>}
            {thread.receipt_items.map((it) => (
              <div key={it.id} className="mb-1 pb-1 border-b border-gray-50 last:border-0">
                <p className="text-gray-700">{labelOf(data!.documents.goods_receipts, it.document_id)}</p>
                <p className="text-gray-400">{trimNumeric(it.quantity_received)}</p>
                {it.locations.map((loc, li) => (
                  <p key={li} className="text-gray-400">→ {loc.label}: {trimNumeric(loc.quantity)}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {data?.truncated && <p className="text-[11px] text-gray-400 mt-2">El recorrido es muy grande y quedó incompleto.</p>}
    </div>
  );
};

export default ElementDocumentTrace;
