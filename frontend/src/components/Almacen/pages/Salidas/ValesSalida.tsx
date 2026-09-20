import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import NuevoValeSalida from './NuevoValeSalida';
import { goodsIssueService } from '../../../../services/almacen/goodsIssue.service';
import { productService } from '../../../../services/almacen/product.service';
import { GoodsIssue, Product } from '../../../../types/almacen.types';

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
          <h1 className="text-xl font-bold text-gray-800">Vale de salida #{detail.goods_issue_id}</h1>
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
                      <tr key={loc.goods_issue_item_location_id}>
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
