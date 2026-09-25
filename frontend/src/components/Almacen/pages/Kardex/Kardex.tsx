import React, { useEffect, useState } from 'react';
import { productService } from '../../../../services/almacen/product.service';
import { inventoryMovementService } from '../../../../services/almacen/inventoryMovement.service';
import { InventoryMovement, Product } from '../../../../types/almacen.types';
import { trimNumeric } from '../../../../utils/numberFormat';

interface KardexProps {
  projectId: number;
}

const Kardex: React.FC<KardexProps> = ({ projectId }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(false);

  const [productId, setProductId] = useState<number | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const getProductLabel = (id: number) => {
    const p = products.find((prod) => prod.product_id === id);
    return p ? p.code : `#${id}`;
  };

  const load = (filters: { product_id?: number; from?: string; to?: string }) => {
    setLoading(true);
    inventoryMovementService
      .getMovements(projectId, filters)
      .then(setMovements)
      .catch(() => setMovements([]))
      .finally(() => setLoading(false));
  };

  // Siempre trae datos frescos al entrar — nunca cachea entre visitas.
  useEffect(() => {
    if (!projectId) return;
    productService.getProducts(projectId).then(setProducts).catch(() => setProducts([]));
    load({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const applyFilters = () => {
    load({ product_id: productId === '' ? undefined : productId, from: from || undefined, to: to || undefined });
  };

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
        <h1 className="text-xl font-bold text-gray-800">Kardex</h1>
        <p className="text-xs text-gray-400 mb-4">Saldo resultante calculado y guardado al momento del movimiento — nunca recalculado al leer.</p>

        <div className="grid grid-cols-1 @sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 mb-4 items-end">
          <label className="block">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Producto</span>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            >
              <option value="">Todos</option>
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>{p.code} — {p.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Desde</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-400 uppercase tracking-wide">Hasta</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            />
          </label>
          <button
            onClick={applyFilters}
            className="bg-[#0056b3] text-white rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-[#004494] transition-colors"
          >
            Filtrar
          </button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 text-left text-xs uppercase tracking-wide border-b border-gray-100">
              <th className="py-2 font-medium">Fecha</th>
              <th className="py-2 font-medium">Producto</th>
              <th className="py-2 font-medium">Tipo</th>
              <th className="py-2 font-medium">Cantidad</th>
              <th className="py-2 font-medium">Bin</th>
              <th className="py-2 font-medium">Saldo</th>
              <th className="py-2 font-medium">Documento</th>
            </tr>
          </thead>
          <tbody>
            {!loading && movements.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-gray-300">Sin movimientos todavía</td>
              </tr>
            )}
            {movements.map((m) => (
              <tr key={m.inventory_movement_id} className="border-b border-gray-50">
                {/* Texto tal cual (AAAA-MM-DD) — new Date() corre un día en zonas al oeste de UTC. */}
                <td className="py-2 text-gray-500">{m.movement_date}</td>
                <td className="py-2 text-gray-800">{getProductLabel(m.product_id)}</td>
                <td className="py-2">
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${m.type === 'entrada' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                    {m.type}
                  </span>
                </td>
                <td className="py-2 text-gray-700">{trimNumeric(m.quantity)}</td>
                <td className="py-2 text-gray-500 font-mono text-xs">#{m.bin_id}</td>
                <td className="py-2 font-semibold text-gray-800">{trimNumeric(m.resulting_balance)}</td>
                <td className="py-2 text-gray-500">{m.reference_document_type} #{m.reference_document_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Kardex;
