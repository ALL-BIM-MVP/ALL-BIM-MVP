import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import NuevoValeSalida from './NuevoValeSalida';
import { goodsIssueService } from '../../../../services/almacen/goodsIssue.service';
import { productService } from '../../../../services/almacen/product.service';
import { inventoryAdjustmentService } from '../../../../services/almacen/inventoryAdjustment.service';
import { GoodsIssue, Product } from '../../../../types/almacen.types';
import { trimNumeric } from '../../../../utils/numberFormat';

type View = 'list' | 'new' | 'detail';

interface ValesSalidaProps {
  projectId: number;
}

const ValesSalida: React.FC<ValesSalidaProps> = ({ projectId }) => {
  const [view, setView] = useState<View>('list');
  const [issues, setIssues] = useState<GoodsIssue[]>([]);
  const [detail, setDetail] = useState<GoodsIssue | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustDate, setAdjustDate] = useState('');
  const [adjustLines, setAdjustLines] = useState<Array<{ goodsIssueItemId: number | ''; binId: number | ''; delta: string }>>([]);
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidDate, setVoidDate] = useState('');
  const [voiding, setVoiding] = useState(false);

  const loadList = () => {
    setLoading(true);
    goodsIssueService
      .getGoodsIssues(projectId)
      .then(setIssues)
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  };

  // Siempre trae datos frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    loadList();
    productService.getProducts(projectId).then(setProducts).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openDetail = (id: number) => {
    goodsIssueService
      .getGoodsIssueById(projectId, id)
      .then((r) => {
        setDetail(r);
        setView('detail');
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : 'No se pudo abrir el vale de salida.'));
  };

  // El backend no resuelve el nombre del producto en el detalle (solo
  // product_id) — lo completamos acá con el catálogo que ya tenemos cargado.
  const getProductLabel = (id: number) => {
    const p = products.find((prod) => prod.product_id === id);
    return p ? `${p.code} — ${p.name}` : `Producto #${id}`;
  };

  const openAdjustModal = () => {
    if (!detail?.items || detail.items.length === 0) return;
    setAdjustReason('');
    setAdjustDate('');
    setAdjustLines([{ goodsIssueItemId: detail.items[0].goods_issue_item_id, binId: '', delta: '' }]);
    setShowAdjustModal(true);
  };

  const addAdjustLine = () => {
    if (!detail?.items || detail.items.length === 0) return;
    setAdjustLines((prev) => [...prev, { goodsIssueItemId: detail.items![0].goods_issue_item_id, binId: '', delta: '' }]);
  };

  const updateAdjustLine = (i: number, patch: Partial<{ goodsIssueItemId: number | ''; binId: number | ''; delta: string }>) => {
    setAdjustLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const removeAdjustLine = (i: number) => {
    setAdjustLines((prev) => prev.filter((_, idx) => idx !== i));
  };

  const locationsForItem = (goodsIssueItemId: number | '') => detail?.items?.find((it) => it.goods_issue_item_id === goodsIssueItemId)?.locations ?? [];

  const confirmAdjustment = async () => {
    if (!detail) return;
    if (!adjustReason.trim()) { window.alert('El motivo es obligatorio.'); return; }
    const items = adjustLines
      .filter((l) => l.goodsIssueItemId && l.binId && l.delta.trim() && parseFloat(l.delta) !== 0)
      .map((l) => ({ goods_issue_item_id: Number(l.goodsIssueItemId), bin_id: Number(l.binId), quantity_delta: parseFloat(l.delta) }));
    if (items.length === 0) { window.alert('Agregá al menos una línea de ajuste válida (casilla y cantidad distinta de 0).'); return; }
    setSavingAdjustment(true);
    try {
      await inventoryAdjustmentService.createGoodsIssueAdjustment(projectId, detail.goods_issue_id, {
        reason: adjustReason.trim(),
        adjustment_date: adjustDate || undefined,
        items,
      });
      setShowAdjustModal(false);
      openDetail(detail.goods_issue_id);
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
      await inventoryAdjustmentService.voidGoodsIssue(projectId, detail.goods_issue_id, {
        reason: voidReason.trim(),
        adjustment_date: voidDate || undefined,
      });
      setShowVoidModal(false);
      openDetail(detail.goods_issue_id);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'No se pudo anular el vale.');
    } finally {
      setVoiding(false);
    }
  };

  if (view === 'new') {
    return (
      <NuevoValeSalida
        projectId={projectId}
        onCancel={() => setView('list')}
        onCreated={(issue) => {
          loadList();
          setDetail(issue);
          setView('detail');
        }}
      />
    );
  }

  if (view === 'detail' && detail) {
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={() => setView('list')} className="text-sm text-[#0056b3] font-medium mb-3">← Volver a Vales de salida</button>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 max-w-5xl">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-xl font-bold text-gray-800">Vale de salida #{detail.goods_issue_id}</h1>
            {!detail.voided && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={openAdjustModal} className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                  Corregir
                </button>
                <button onClick={() => { setVoidReason(''); setVoidDate(''); setShowVoidModal(true); }} className="border border-red-200 text-red-500 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-red-50">
                  Anular
                </button>
              </div>
            )}
          </div>
          {detail.voided && (
            <div className="mt-2 mb-2 bg-red-50 border border-red-100 rounded-lg p-3">
              <p className="text-sm text-red-700 font-semibold">Vale anulado{detail.voided_at ? ` el ${detail.voided_at}` : ''}.</p>
              <p className="text-xs text-red-600 mt-0.5">Se revirtió todo lo efectivo — devuelve el stock retirado.</p>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {detail.recipient_name} (DNI {detail.recipient_dni}) · Destino: {detail.destination_sector} · {detail.destination_level} · {detail.destination_block}
          </p>
          <p className="text-sm text-gray-500">
            Salida: {new Date(detail.issue_date).toLocaleDateString()} · Registrado: {new Date(detail.created_at).toLocaleString()}
          </p>

          <div className="mt-4 grid grid-cols-1 @lg:grid-cols-2 gap-3">
            {detail.items?.map((item) => (
              <div key={item.goods_issue_item_id} className="border border-gray-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {getProductLabel(item.product_id)}
                  {' — '}{trimNumeric(item.effective_quantity ?? item.total_quantity)} en total
                  {item.effective_quantity !== undefined && item.effective_quantity !== String(item.total_quantity) && (
                    <span className="text-gray-400 font-normal normal-case"> (registrado {trimNumeric(item.total_quantity)})</span>
                  )}
                </p>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 text-left border-b border-gray-100">
                      <th className="py-1 font-medium">Bin</th>
                      <th className="py-1 font-medium">Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.locations.map((loc) => (
                      <tr key={loc.goods_issue_item_location_id}>
                        <td className="py-1 text-gray-700">#{loc.bin_id}</td>
                        <td className="py-1 text-gray-700">{trimNumeric(loc.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {item.adjustments && item.adjustments.length > 0 && (
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
              <h3 className="text-lg font-bold text-gray-800 mb-1">Corregir vale de salida</h3>
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
                Líneas del ajuste — retirar de más BAJA el stock; devolver lo retirado de más lo SUBE
              </p>
              <div className="space-y-2 mb-3">
                {adjustLines.map((line, i) => (
                  <div key={i} className="grid grid-cols-1 @sm:grid-cols-[1fr_1fr_6rem_auto] gap-2 items-end border border-gray-100 rounded-lg p-2">
                    <label className="block">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wide">Línea</span>
                      <select
                        value={line.goodsIssueItemId}
                        onChange={(e) => updateAdjustLine(i, { goodsIssueItemId: e.target.value ? parseInt(e.target.value, 10) : '', binId: '' })}
                        className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                      >
                        {detail.items?.map((it) => (
                          <option key={it.goods_issue_item_id} value={it.goods_issue_item_id}>{getProductLabel(it.product_id)}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wide">Casilla</span>
                      <select
                        value={line.binId}
                        onChange={(e) => updateAdjustLine(i, { binId: e.target.value ? Number(e.target.value) : '' })}
                        className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
                      >
                        <option value="">Elegir...</option>
                        {locationsForItem(line.goodsIssueItemId).map((loc) => (
                          <option key={loc.bin_id} value={loc.bin_id}>#{loc.bin_id} (registrado: {trimNumeric(loc.quantity)})</option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-gray-400 uppercase tracking-wide">Cantidad</span>
                      <input
                        type="number"
                        value={line.delta}
                        onChange={(e) => updateAdjustLine(i, { delta: e.target.value })}
                        placeholder="+5 / -2"
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

        {showVoidModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
            <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-gray-800 mb-1">Anular vale de salida</h3>
              <p className="text-xs text-gray-400 mb-4">Revierte todo lo efectivo de este vale (devuelve el stock retirado). No se puede deshacer.</p>
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
            <h1 className="text-xl font-bold text-gray-800">Vales de salida</h1>
          </div>
          <button
            onClick={() => setView('new')}
            className="flex items-center gap-1.5 bg-[#0056b3] text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-[#004494] transition-colors"
          >
            <Plus size={15} /> Nuevo vale de salida
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 font-medium">Fecha salida</th>
              <th className="py-2 font-medium">Destino</th>
              <th className="py-2 font-medium">Retira</th>
              <th className="py-2 font-medium">DNI</th>
              <th className="py-2 font-medium">Registrado</th>
            </tr>
          </thead>
          <tbody>
            {!loading && issues.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-300">Sin vales de salida todavía</td>
              </tr>
            )}
            {issues.map((r) => (
              <tr key={r.goods_issue_id} onClick={() => openDetail(r.goods_issue_id)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50">
                <td className="py-2 text-gray-700">{new Date(r.issue_date).toLocaleDateString()}</td>
                <td className="py-2 text-gray-700">{r.destination_sector} · {r.destination_level} · {r.destination_block}</td>
                <td className="py-2 text-gray-500">{r.recipient_name}</td>
                <td className="py-2 text-gray-500 font-mono">{r.recipient_dni}</td>
                <td className="py-2 text-gray-400">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ValesSalida;
