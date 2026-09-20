import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import NuevoIngreso from './NuevoIngreso';
import { goodsReceiptService } from '../../../../services/almacen/goodsReceipt.service';
import { productService } from '../../../../services/almacen/product.service';
import { GoodsReceipt, Product } from '../../../../types/almacen.types';

type View = 'list' | 'new' | 'detail';

interface IngresosProps {
  projectId: number;
}

const Ingresos: React.FC<IngresosProps> = ({ projectId }) => {
  const [view, setView] = useState<View>('list');
  const [receipts, setReceipts] = useState<GoodsReceipt[]>([]);
  const [detail, setDetail] = useState<GoodsReceipt | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

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
    productService.getProducts(projectId).then(setProducts).catch(() => setProducts([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const openDetail = (id: number) => {
    goodsReceiptService
      .getGoodsReceiptById(projectId, id)
      .then((r) => {
        setDetail(r);
        setView('detail');
      })
      .catch((err) => window.alert(err instanceof Error ? err.message : 'No se pudo abrir el ingreso.'));
  };

  // El backend no resuelve el nombre del producto en el detalle (solo
  // product_id) — lo completamos acá con el catálogo que ya tenemos cargado.
  const getProductLabel = (id: number) => {
    const p = products.find((prod) => prod.product_id === id);
    return p ? `${p.code} — ${p.name}` : `Producto #${id}`;
  };

  if (view === 'new') {
    return (
      <NuevoIngreso
        projectId={projectId}
        onCancel={() => setView('list')}
        onCreated={(receipt) => {
          loadList();
          setDetail(receipt);
          setView('detail');
        }}
      />
    );
  }

  if (view === 'detail' && detail) {
    return (
      <div className="h-full overflow-y-auto p-6 @container">
        <button onClick={() => setView('list')} className="text-sm text-[#0056b3] font-medium mb-3">← Volver a Ingresos</button>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 max-w-5xl">
          <h1 className="text-xl font-bold text-gray-800">Ingreso #{detail.goods_receipt_id}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {detail.supplier_name} (RUC {detail.supplier_ruc}) · Guía {detail.delivery_note_number} · Compra: {new Date(detail.purchase_date).toLocaleDateString()} · Registrado: {new Date(detail.created_at).toLocaleString()}
          </p>

          <div className="mt-4 grid grid-cols-1 @lg:grid-cols-2 gap-3">
            {detail.items?.map((item) => (
              <div key={item.goods_receipt_item_id} className="border border-gray-100 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {getProductLabel(item.product_id)} — {item.total_quantity} en total
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
                      <tr key={loc.goods_receipt_item_location_id}>
                        <td className="py-1 text-gray-700">#{loc.bin_id}</td>
                        <td className="py-1 text-gray-700">{loc.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </div>
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
              <th className="py-2 font-medium">Fecha compra</th>
              <th className="py-2 font-medium">Proveedor</th>
              <th className="py-2 font-medium">RUC</th>
              <th className="py-2 font-medium">Guía</th>
              <th className="py-2 font-medium">Registrado</th>
            </tr>
          </thead>
          <tbody>
            {!loading && receipts.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-300">Sin ingresos todavía</td>
              </tr>
            )}
            {receipts.map((r) => (
              <tr key={r.goods_receipt_id} onClick={() => openDetail(r.goods_receipt_id)} className="border-b border-gray-50 cursor-pointer hover:bg-gray-50">
                <td className="py-2 text-gray-700">{new Date(r.purchase_date).toLocaleDateString()}</td>
                <td className="py-2 text-gray-700">{r.supplier_name}</td>
                <td className="py-2 text-gray-500 font-mono">{r.supplier_ruc}</td>
                <td className="py-2 text-gray-500">{r.delivery_note_number}</td>
                <td className="py-2 text-gray-400">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Ingresos;
