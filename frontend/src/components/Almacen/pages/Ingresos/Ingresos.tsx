import React, { useEffect, useState } from 'react';
import { Plus, Check, TriangleAlert, Minus, Trash2 } from 'lucide-react';
import NuevoIngreso from './NuevoIngreso';
import DocumentAlerts from '../../components/DocumentAlerts';
import CiudadModal from '../../components/CiudadModal';
import { goodsReceiptService } from '../../../../services/almacen/goodsReceipt.service';
import { purchaseOrderService } from '../../../../services/almacen/purchaseOrder.service';
import { inventoryAdjustmentService } from '../../../../services/almacen/inventoryAdjustment.service';
import { projectService } from '../../../../services/project.service';
import { DocumentPresence, GoodsReceipt, GoodsReceiptListItem, PurchaseOrderListItem } from '../../../../types/almacen.types';
import { resolveMediaUrl } from '../../../../utils/media';
import { trimNumeric } from '../../../../utils/numberFormat';

type View = 'list' | 'new' | 'detail';

const PRESENCE_LABEL: Record<DocumentPresence, string> = { presente: 'Presente', pendiente: 'Pendiente', no_aplica: 'No aplica' };

// Checklist del expediente (Fase 8): ✓ presente, ⚠ pendiente (falta registrar), — no aplica a este tipo de entrada.
const PresenceIcon: React.FC<{ label: string; value: DocumentPresence }> = ({ label, value }) => (
  <span title={`${label}: ${PRESENCE_LABEL[value]}`} className="inline-flex items-center">
    {value === 'presente' ? (
      <Check size={13} className="text-green-600" />
    ) : value === 'pendiente' ? (
      <TriangleAlert size={13} className="text-amber-500" />
    ) : (
      <Minus size={13} className="text-gray-300" />
    )}
  </span>
);

interface IngresosProps {
  projectId: number;
}

const Ingresos: React.FC<IngresosProps> = ({ projectId }) => {
  const [view, setView] = useState<View>('list');
  const [receipts, setReceipts] = useState<GoodsReceiptListItem[]>([]);
  const [detail, setDetail] = useState<GoodsReceipt | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);

  const [linkingOrders, setLinkingOrders] = useState<PurchaseOrderListItem[]>([]);
  const [linkOrderId, setLinkOrderId] = useState('');

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustDate, setAdjustDate] = useState('');
  const [adjustLines, setAdjustLines] = useState<Array<{ goodsReceiptItemId: string; binId: number | ''; binLabel: string; delta: string }>>([]);
  const [pickingBinForLine, setPickingBinForLine] = useState<number | null>(null);
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidDate, setVoidDate] = useState('');
  const [voiding, setVoiding] = useState(false);

  const loadList = () => {
    setLoading(true);
    goodsReceiptService
      .getGoodsReceipts(projectId)
      .then(setReceipts)
      .catch(() => setReceipts([]))
      .finally(() => setLoading(false));
  };

  // Siempre trae datos frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openDetail = (id: string) => {
    goodsReceiptService
      .getGoodsReceiptById(projectId, id)
      .then((r) => {
        setDetail(r);
        setLinkOrderId('');
        setView('detail');
        if (r.entry_type === 'normal' && !r.purchase_order) {
          purchaseOrderService.getOrders(projectId, { supplierId: r.supplier.supplier_id }).then(setLinkingOrders).catch(() => setLinkingOrders([]));
        }
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : 'No se pudo abrir el ingreso.'));
  };

  const backToList = () => {
    setView('list');
    setDetail(null);
    loadList();
  };

  const handleFileUpload = async (file: File | null) => {
    if (!file || !detail) return;
    setUploadingFile(true);
    try {
      const uploaded = await projectService.uploadFile(projectId, file, 'almacen');
      const updated = await goodsReceiptService.setFile(projectId, detail.goods_receipt_id, uploaded.file_id);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo adjuntar el archivo.');
    } finally {
      setUploadingFile(false);
    }
  };

  const removeFile = async () => {
    if (!detail) return;
    try {
      const updated = await goodsReceiptService.setFile(projectId, detail.goods_receipt_id, null);
      setDetail(updated);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo quitar el archivo.');
    }
  };

  // Vincula la orden citando, en orden, la misma línea de orden que ya traía cada línea del
  // ingreso cuando se creó desde ahí — acá cubre el caso simple: el ingreso quedó "normal" sin
  // vincular y ahora se le asigna una orden completa cuyas líneas coinciden 1 a 1 por posición.
  const linkOrder = async () => {
    if (!detail || !linkOrderId) return;
    try {
      const order = await purchaseOrderService.getOrderById(projectId, linkOrderId);
      if (!detail.items || order.items.length !== detail.items.length) {
        window.alert('La orden elegida no tiene la misma cantidad de líneas que este ingreso — hay que indicar la línea de orden de cada línea a mano (todavía no soportado acá).');
        return;
      }
      const updated = await goodsReceiptService.linkPurchaseOrder(projectId, detail.goods_receipt_id, {
        purchase_order_id: Number(linkOrderId),
        items: detail.items.map((it, i) => ({ goods_receipt_item_id: it.goods_receipt_item_id, purchase_order_item_id: order.items[i].purchase_order_item_id })),
      });
      setDetail(updated);
      setLinkOrderId('');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo vincular la orden.');
    }
  };

  const openAdjustModal = () => {
    if (!detail?.items || detail.items.length === 0) return;
    setAdjustReason('');
    setAdjustDate('');
    setAdjustLines([{ goodsReceiptItemId: detail.items[0].goods_receipt_item_id, binId: '', binLabel: '', delta: '' }]);
    setShowAdjustModal(true);
  };

  const addAdjustLine = () => {
    if (!detail?.items || detail.items.length === 0) return;
    setAdjustLines((prev) => [...prev, { goodsReceiptItemId: detail.items![0].goods_receipt_item_id, binId: '', binLabel: '', delta: '' }]);
  };

  const updateAdjustLine = (i: number, patch: Partial<{ goodsReceiptItemId: string; binId: number | ''; binLabel: string; delta: string }>) => {
    setAdjustLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const removeAdjustLine = (i: number) => {
    setAdjustLines((prev) => prev.filter((_, idx) => idx !== i));
  };

  // Reusa las casillas YA usadas por esa línea (registradas) como opciones rápidas — para mover a
  // una casilla nueva está el botón "Otra casilla..." (mismo CiudadModal que en Nuevo ingreso).
  const locationsForItem = (goodsReceiptItemId: string) => detail?.items?.find((it) => it.goods_receipt_item_id === goodsReceiptItemId)?.locations ?? [];

  const confirmAdjustment = async () => {
    if (!detail) return;
    if (!adjustReason.trim()) { window.alert('El motivo es obligatorio.'); return; }
    const items = adjustLines
      .filter((l) => l.goodsReceiptItemId && l.binId && l.delta.trim() && parseFloat(l.delta) !== 0)
      .map((l) => ({ goods_receipt_item_id: Number(l.goodsReceiptItemId), bin_id: Number(l.binId), quantity_delta: parseFloat(l.delta) }));
    if (items.length === 0) { window.alert('Agregá al menos una línea de ajuste válida (casilla y cantidad distinta de 0).'); return; }
    setSavingAdjustment(true);
    try {
      await inventoryAdjustmentService.createGoodsReceiptAdjustment(projectId, detail.goods_receipt_id, {
        reason: adjustReason.trim(),
        adjustment_date: adjustDate || undefined,
        items,
      });
      setShowAdjustModal(false);
      openDetail(detail.goods_receipt_id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo registrar el ajuste.');
    } finally {
      setSavingAdjustment(false);
    }
  };

  const confirmVoid = async () => {
    if (!detail) return;
    if (!voidReason.trim()) { window.alert('El motivo es obligatorio.'); return; }
    setVoiding(true);
    try {
      await inventoryAdjustmentService.voidGoodsReceipt(projectId, detail.goods_receipt_id, {
        reason: voidReason.trim(),
        adjustment_date: voidDate || undefined,
      });
      setShowVoidModal(false);
      openDetail(detail.goods_receipt_id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo anular el ingreso.');
    } finally {
      setVoiding(false);
    }
  };

  if (view === 'new') {
    return (
      <NuevoIngreso
        projectId={projectId}
        onCancel={() => setView('list')}
        onCreated={(receipt) => {
          loadList();
          openDetail(receipt.goods_receipt_id);
        }}
      />
    );
  }

  if (view === 'detail' && detail) {
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={backToList} className="text-sm text-[#0056b3] font-medium mb-3">← Volver a Ingresos</button>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 max-w-5xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-800">Guía {detail.delivery_note_series}-{detail.delivery_note_number}</h1>
              <p className="text-sm text-gray-500 mt-1">
                {detail.supplier.name} (RUC {detail.supplier.ruc}) · Guía: {detail.delivery_note_date} · Recibido: {detail.received_date}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${detail.entry_type === 'rapida' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-[#0056b3]'}`}>
                {detail.entry_type === 'rapida' ? 'Entrada rápida' : 'Normal'}
              </span>
              {!detail.voided && (
                <>
                  <button onClick={openAdjustModal} className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                    Corregir
                  </button>
                  <button onClick={() => { setVoidReason(''); setVoidDate(''); setShowVoidModal(true); }} className="border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-red-50">
                    Anular
                  </button>
                </>
              )}
            </div>
          </div>

          {detail.voided && (
            <div className="mt-3 bg-red-50 border border-red-100 rounded-lg p-3">
              <p className="text-sm text-red-700 font-semibold">Ingreso anulado{detail.voided_at ? ` el ${detail.voided_at}` : ''}.</p>
              <p className="text-xs text-red-600 mt-0.5">Se revirtió todo lo efectivo — ya no cuenta como stock ni para los candados de la orden.</p>
            </div>
          )}

          {detail.purchase_order ? (
            <p className="text-sm text-[#0056b3] font-medium mt-2">Orden de compra: {detail.purchase_order.number}</p>
          ) : detail.entry_type === 'normal' ? (
            <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg p-3">
              <p className="text-xs text-amber-700 mb-2">Todavía no tiene una orden de compra vinculada.</p>
              <div className="flex gap-2">
                <select
                  value={linkOrderId}
                  onChange={(e) => setLinkOrderId(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                >
                  <option value="">Elegir orden del mismo proveedor...</option>
                  {linkingOrders.map((o) => (
                    <option key={o.purchase_order_id} value={o.purchase_order_id}>{o.number}</option>
                  ))}
                </select>
                <button onClick={linkOrder} disabled={!linkOrderId} className="bg-[#0056b3] text-white rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-[#004494] disabled:opacity-50">
                  Vincular
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-3">
            <DocumentAlerts alerts={detail.alerts} />
          </div>

          <div className="mt-4">
            <p className="text-sm font-semibold text-gray-700 mb-2">Escaneo de la guía</p>
            {detail.file ? (
              <div className="flex items-center justify-between gap-3">
                <a href={resolveMediaUrl(detail.file.url)} target="_blank" rel="noreferrer" className="text-sm text-[#0056b3] hover:underline truncate">
                  {detail.file.name}
                </a>
                <button onClick={removeFile} className="text-xs text-red-500 font-medium hover:underline flex-shrink-0">Quitar</button>
              </div>
            ) : (
              <div>
                <input
                  type="file"
                  onChange={(e) => handleFileUpload(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-blue-50 file:text-[#0056b3] hover:file:bg-blue-100"
                />
                {uploadingFile && <p className="text-xs text-gray-400 mt-1">Subiendo...</p>}
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 @lg:grid-cols-2 gap-3">
            {detail.items?.map((item) => (
              <div key={item.goods_receipt_item_id} className="border border-gray-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  {item.product ? `${item.product.code} — ${item.product.name}` : item.purchase_order_item?.description ?? 'Producto'}
                  {' — '}{trimNumeric(item.effective_quantity)} en total
                  {item.effective_quantity !== item.total_quantity && (
                    <span className="text-gray-400 font-normal normal-case"> (registrado {trimNumeric(item.total_quantity)})</span>
                  )}
                </p>
                <div className="flex items-center gap-1.5 mb-2 text-[11px] text-gray-400">
                  {item.purchase_order_progress && (
                    <span>ordenado {trimNumeric(item.purchase_order_progress.ordered)} · facturado {trimNumeric(item.purchase_order_progress.invoiced)}</span>
                  )}
                  {item.alerts.length > 0 && (
                    <span title={item.alerts.map((a) => a.message).join(' — ')}>
                      <TriangleAlert size={12} className="text-amber-500 flex-shrink-0" />
                    </span>
                  )}
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 text-left border-b border-gray-100">
                      <th className="py-1 font-medium">Bin</th>
                      <th className="py-1 font-medium">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.effective_locations.map((loc) => (
                      <tr key={loc.bin_id}>
                        <td className="py-1 text-gray-700">{loc.label}</td>
                        <td className="py-1 text-gray-700">{trimNumeric(loc.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {item.adjustments.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-50">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Ajustes</p>
                    {item.adjustments.map((adj) => (
                      <p key={adj.inventory_adjustment_id} className="text-[11px] text-gray-500">
                        {adj.kind === 'anulacion' ? 'Anulación' : 'Corrección'} · {parseFloat(adj.quantity_delta) > 0 ? '+' : ''}{trimNumeric(adj.quantity_delta)} · {adj.reason}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {showAdjustModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Corregir ingreso</h3>
              <p className="text-xs text-gray-400 mb-4">El registro original no cambia — esto agrega un ajuste aparte, con su propio motivo.</p>

              <label className="block mb-3">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Motivo (obligatorio)</span>
                <textarea
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                />
              </label>
              <label className="block mb-4">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Fecha del ajuste (opcional, hoy por defecto)</span>
                <input
                  type="date"
                  value={adjustDate}
                  onChange={(e) => setAdjustDate(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                />
              </label>

              <p className="text-[11px] text-gray-400 uppercase tracking-wide mb-2">
                Líneas del ajuste — la cantidad es el cambio en esa casilla (positivo suma, negativo resta)
              </p>
              <div className="space-y-2 mb-3">
                {adjustLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-1 @sm:grid-cols-[1fr_1fr_6rem_auto] gap-2 items-end border border-gray-100 rounded-lg p-2">
                    <label className="block">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wide">Línea</span>
                      <select
                        value={line.goodsReceiptItemId}
                        onChange={(e) => updateAdjustLine(i, { goodsReceiptItemId: e.target.value, binId: '', binLabel: '' })}
                        className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                      >
                        {detail.items?.map((it) => (
                          <option key={it.goods_receipt_item_id} value={it.goods_receipt_item_id}>
                            {it.product ? `${it.product.code} — ${it.product.name}` : it.purchase_order_item?.description ?? 'Producto'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wide">Casilla</span>
                      <select
                        value={line.binId}
                        onChange={(e) => {
                          if (e.target.value === 'new') { setPickingBinForLine(i); return; }
                          const loc = locationsForItem(line.goodsReceiptItemId).find((l) => l.bin_id === e.target.value);
                          updateAdjustLine(i, { binId: e.target.value ? Number(e.target.value) : '', binLabel: loc ? `#${loc.bin_id}` : line.binLabel });
                        }}
                        className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                      >
                        <option value="">Elegir...</option>
                        {locationsForItem(line.goodsReceiptItemId).map((loc) => (
                          <option key={loc.bin_id} value={loc.bin_id}>#{loc.bin_id} (registrado: {trimNumeric(loc.quantity)})</option>
                        ))}
                        <option value="new">Otra casilla...</option>
                        {line.binId && !locationsForItem(line.goodsReceiptItemId).some((l) => l.bin_id === String(line.binId)) && (
                          <option value={line.binId}>{line.binLabel || `#${line.binId}`}</option>
                        )}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wide">Cantidad</span>
                      <input
                        type="number"
                        value={line.delta}
                        onChange={(e) => updateAdjustLine(i, { delta: e.target.value })}
                        placeholder="+18 / -3"
                        className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                      />
                    </label>
                    <button onClick={() => removeAdjustLine(i)} disabled={adjustLines.length === 1} className="text-gray-300 hover:text-red-500 disabled:opacity-30 pb-2">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button onClick={addAdjustLine} className="flex items-center gap-1.5 text-sm text-[#0056b3] font-medium mb-4">
                <Plus size={15} /> Agregar línea de ajuste
              </button>

              <div className="flex gap-2">
                <button onClick={() => setShowAdjustModal(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={confirmAdjustment} disabled={savingAdjustment} className="flex-1 bg-[#0056b3] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[#004494] disabled:opacity-50">
                  {savingAdjustment ? 'Guardando...' : 'Confirmar ajuste'}
                </button>
              </div>
            </div>
          </div>
        )}

        {pickingBinForLine !== null && (
          <CiudadModal
            projectId={projectId}
            onClose={() => setPickingBinForLine(null)}
            pickMode={{
              itemLabel: 'este ajuste',
              onConfirm: (bin) => {
                updateAdjustLine(pickingBinForLine, { binId: bin.binId, binLabel: bin.label });
                setPickingBinForLine(null);
              },
            }}
          />
        )}

        {showVoidModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Anular ingreso</h3>
              <p className="text-xs text-gray-400 mb-4">Revierte todo lo efectivo de este ingreso. No se puede deshacer.</p>
              <label className="block mb-3">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Motivo (obligatorio)</span>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={2}
                  className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                />
              </label>
              <label className="block mb-4">
                <span className="text-[11px] text-gray-400 uppercase tracking-wide">Fecha (opcional, hoy por defecto)</span>
                <input
                  type="date"
                  value={voidDate}
                  onChange={(e) => setVoidDate(e.target.value)}
                  className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                />
              </label>
              <div className="flex gap-2">
                <button onClick={() => setShowVoidModal(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm font-semibold py-2 rounded-lg hover:bg-gray-50">
                  Cancelar
                </button>
                <button onClick={confirmVoid} disabled={voiding} className="flex-1 bg-red-600 text-white text-sm font-semibold py-2 rounded-lg hover:bg-red-700 disabled:opacity-50">
                  {voiding ? 'Anulando...' : 'Anular definitivamente'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-gray-800">Ingresos</h1>
          </div>
          <button
            onClick={() => setView('new')}
            className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors"
          >
            <Plus size={15} /> Nuevo ingreso
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 font-medium">Guía</th>
              <th className="py-2 font-medium">Proveedor</th>
              <th className="py-2 font-medium">Tipo</th>
              <th className="py-2 font-medium">Orden</th>
              <th className="py-2 font-medium">Recibido</th>
              <th className="py-2 font-medium">Expediente</th>
            </tr>
          </thead>
          <tbody>
            {!loading && receipts.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-300">Sin ingresos todavía</td>
              </tr>
            )}
            {receipts.map((r) => (
              <tr key={r.goods_receipt_id} onClick={() => openDetail(r.goods_receipt_id)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50">
                <td className="py-2 font-mono text-xs text-gray-700">{r.delivery_note_series}-{r.delivery_note_number}</td>
                <td className="py-2 text-gray-700">{r.supplier.name}</td>
                <td className="py-2">
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${r.entry_type === 'rapida' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-[#0056b3]'}`}>
                    {r.entry_type === 'rapida' ? 'Rápida' : 'Normal'}
                  </span>
                </td>
                <td className="py-2 text-gray-500">{r.purchase_order?.number ?? '—'}</td>
                <td className="py-2 text-gray-500">{r.received_date}</td>
                <td className="py-2">
                  <div className="flex items-center gap-1.5">
                    <PresenceIcon label="Requerimiento" value={r.documents.requisition} />
                    <PresenceIcon label="Cotización" value={r.documents.quotation} />
                    <PresenceIcon label="Orden" value={r.documents.purchase_order} />
                    <PresenceIcon label="Factura" value={r.documents.invoice} />
                    <PresenceIcon label="Escaneo de guía" value={r.documents.delivery_note_file} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Ingresos;
