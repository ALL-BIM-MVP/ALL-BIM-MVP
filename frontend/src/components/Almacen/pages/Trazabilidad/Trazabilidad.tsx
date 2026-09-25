import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { traceabilityService } from '../../../../services/almacen/traceability.service';
import { purchaseRequisitionService } from '../../../../services/almacen/purchaseRequisition.service';
import { quotationService } from '../../../../services/almacen/quotation.service';
import { purchaseOrderService } from '../../../../services/almacen/purchaseOrder.service';
import { invoiceService } from '../../../../services/almacen/invoice.service';
import { goodsReceiptService } from '../../../../services/almacen/goodsReceipt.service';
import {
  TraceabilityDirection, TraceabilityDocumentRef, TraceabilityDocumentType, TraceabilityResponse,
} from '../../../../types/almacen.types';
import { trimNumeric } from '../../../../utils/numberFormat';

interface TrazabilidadProps {
  projectId: number;
}

interface DocOption { id: string; label: string; }

const DOC_TYPE_LABEL: Record<TraceabilityDocumentType, string> = {
  requisition: 'Requerimiento',
  quotation: 'Cotización',
  'purchase-order': 'Orden de compra',
  invoice: 'Factura',
  'goods-receipt': 'Ingreso',
};

const Trazabilidad: React.FC<TrazabilidadProps> = ({ projectId }) => {
  const [documentType, setDocumentType] = useState<TraceabilityDocumentType>('requisition');
  const [options, setOptions] = useState<DocOption[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [direction, setDirection] = useState<TraceabilityDirection>('all');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TraceabilityResponse | null>(null);

  // Cada tipo de documento tiene su propio listado — se recarga al cambiar el selector.
  useEffect(() => {
    if (!projectId) return;
    setDocumentId('');
    setResult(null);
    const load = async () => {
      if (documentType === 'requisition') {
        const rows = await purchaseRequisitionService.getRequisitions(projectId);
        setOptions(rows.map((r) => ({ id: r.purchase_requisition_id, label: r.number })));
      } else if (documentType === 'quotation') {
        const rows = await quotationService.getQuotations(projectId);
        setOptions(rows.map((r) => ({ id: r.quotation_id, label: `${r.number} — ${r.supplier.name}` })));
      } else if (documentType === 'purchase-order') {
        const rows = await purchaseOrderService.getOrders(projectId);
        setOptions(rows.map((r) => ({ id: r.purchase_order_id, label: `${r.number} — ${r.supplier.name}` })));
      } else if (documentType === 'invoice') {
        const rows = await invoiceService.getInvoices(projectId);
        setOptions(rows.map((r) => ({ id: r.invoice_id, label: `${r.series}-${r.number} — ${r.supplier.name}` })));
      } else {
        const rows = await goodsReceiptService.getGoodsReceipts(projectId);
        setOptions(rows.map((r) => ({ id: r.goods_receipt_id, label: `${r.delivery_note_series}-${r.delivery_note_number} — ${r.supplier.name}` })));
      }
    };
    load().catch(() => setOptions([]));
  }, [projectId, documentType]);

  const search = () => {
    if (!documentId) return;
    setLoading(true);
    traceabilityService
      .getTraceability(projectId, documentType, documentId, direction)
      .then(setResult)
      .catch((err) => window.alert(err instanceof Error ? err.message : 'No se pudo cargar la trazabilidad.'))
      .finally(() => setLoading(false));
  };

  // Busca el label real de un documento citado por una línea, entre los documentos ya traídos.
  const labelOf = (list: TraceabilityDocumentRef[], docId: string) => list.find((d) => d.id === docId)?.label ?? docId;

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Trazabilidad</h1>
      <p className="text-sm text-gray-400 mb-4">El recorrido completo de un elemento: desde el requerimiento hasta dónde quedó ubicado.</p>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
        <div className="grid grid-cols-1 @sm:grid-cols-4 gap-3 items-end">
          <label className="block">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Tipo de documento</span>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as TraceabilityDocumentType)}
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            >
              {(Object.keys(DOC_TYPE_LABEL) as TraceabilityDocumentType[]).map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABEL[t]}</option>
              ))}
            </select>
          </label>
          <label className="block @sm:col-span-2">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Documento</span>
            <select
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            >
              <option value="">Elegir...</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Dirección</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as TraceabilityDirection)}
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            >
              <option value="all">Todo el recorrido</option>
              <option value="backward">Hacia atrás (origen)</option>
              <option value="forward">Hacia adelante</option>
            </select>
          </label>
        </div>
        <button
          onClick={search}
          disabled={!documentId || loading}
          className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors disabled:opacity-50 mt-3"
        >
          <Search size={15} /> {loading ? 'Buscando...' : 'Ver trazabilidad'}
        </button>
      </div>

      {result && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 mb-4">
            <p className="text-[11px] text-gray-400 uppercase tracking-wide">Documento de partida</p>
            <p className="text-lg font-bold text-gray-800">{result.anchor.label}</p>
            {result.truncated && (
              <p className="text-xs text-amber-600 mt-1">⚠ El recorrido es muy grande y quedó incompleto (más de 2000 líneas).</p>
            )}
          </div>

          {result.threads.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 text-center text-gray-300">
              Sin elementos conectados.
            </div>
          )}

          {result.threads.map((thread, i) => (
            <div key={i} className={`bg-white border rounded-xl shadow-sm p-5 mb-3 ${thread.contains_anchor ? 'border-[#0056b3]' : 'border-gray-200'}`}>
              <p className="text-sm font-bold text-gray-800 mb-3">
                {thread.product.code} — {thread.product.name} <span className="text-gray-400 font-normal">({thread.product.unit})</span>
              </p>

              <div className="grid grid-cols-1 @lg:grid-cols-5 gap-3 text-xs">
                <div>
                  <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Requerimiento</p>
                  {thread.requisition_items.length === 0 && <p className="text-gray-300 italic">—</p>}
                  {thread.requisition_items.map((it) => (
                    <div key={it.id} className="mb-1.5 pb-1.5 border-b border-gray-50 last:border-0">
                      <p className="text-gray-700">{labelOf(result.documents.requisitions, it.document_id)}</p>
                      <p className="text-gray-400">{trimNumeric(it.quantity_requested)}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Cotizaciones</p>
                  {thread.quotation_items.length === 0 && <p className="text-gray-300 italic">—</p>}
                  {thread.quotation_items.map((it) => (
                    <div key={it.id} className="mb-1.5 pb-1.5 border-b border-gray-50 last:border-0">
                      <p className="text-gray-700">{labelOf(result.documents.quotations, it.document_id)}</p>
                      <p className="text-gray-400">{trimNumeric(it.quantity_quoted)} {it.unit_price ? `· ${trimNumeric(it.unit_price)} c/u` : ''}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Órdenes</p>
                  {thread.purchase_order_items.length === 0 && <p className="text-gray-300 italic">—</p>}
                  {thread.purchase_order_items.map((it) => (
                    <div key={it.id} className="mb-1.5 pb-1.5 border-b border-gray-50 last:border-0">
                      <p className="text-gray-700">{labelOf(result.documents.purchase_orders, it.document_id)}</p>
                      <p className="text-gray-400">{trimNumeric(it.quantity_ordered)}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Facturas</p>
                  {thread.invoice_items.length === 0 && <p className="text-gray-300 italic">—</p>}
                  {thread.invoice_items.map((it) => (
                    <div key={it.id} className="mb-1.5 pb-1.5 border-b border-gray-50 last:border-0">
                      <p className="text-gray-700">{labelOf(result.documents.invoices, it.document_id)}</p>
                      <p className="text-gray-400">{trimNumeric(it.quantity_invoiced)}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Ingresos</p>
                  {thread.receipt_items.length === 0 && <p className="text-gray-300 italic">—</p>}
                  {thread.receipt_items.map((it) => (
                    <div key={it.id} className="mb-1.5 pb-1.5 border-b border-gray-50 last:border-0">
                      <p className="text-gray-700">{labelOf(result.documents.goods_receipts, it.document_id)}</p>
                      <p className="text-gray-400">{trimNumeric(it.quantity_received)}</p>
                      {it.locations.map((loc, li) => (
                        <p key={li} className="text-gray-400">→ {loc.label}: {trimNumeric(loc.quantity)}</p>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

export default Trazabilidad;
