import React, { useState } from 'react';
import SearchCombobox from './SearchCombobox';
import CreateProductModal from './CreateProductModal';
import { DraftProductCandidate, Product } from '../../../types/almacen.types';

interface ProductPickerProps {
  projectId: number;
  selected: Product | null;
  onSelect: (product: Product | null) => void;
  products: Product[]; // catálogo ya cargado por la pantalla (búsqueda local y resolver sugeridos)
  candidates?: DraftProductCandidate[]; // sugeridos por la IA cuando no hubo coincidencia clara
  prefill?: { name?: string; unit?: string; code?: string }; // lo que dice el documento
  onCreated: (product: Product) => void; // la pantalla suma el producto nuevo a su catálogo
}

/** Producto de una línea: búsqueda en el catálogo, aviso "Sin vincular", sugeridos de la IA y "+ Crear producto". */
const ProductPicker: React.FC<ProductPickerProps> = ({ projectId, selected, onSelect, products, candidates = [], prefill, onCreated }) => {
  const [creating, setCreating] = useState(false);

  const search = (term: string) => {
    const t = term.trim().toLowerCase();
    return Promise.resolve(products.filter((p) => !t || p.code.toLowerCase().includes(t) || p.name.toLowerCase().includes(t)).slice(0, 30));
  };

  const suggested = candidates
    .map((c) => products.find((p) => String(p.product_id) === String(c.product_id)))
    .filter((p): p is Product => !!p);

  return (
    <div>
      <SearchCombobox<Product>
        selected={selected}
        onSelect={onSelect}
        search={search}
        getId={(p) => p.product_id}
        getLabel={(p) => `${p.code} — ${p.name}`}
        getSubLabel={(p) => p.unit}
        placeholder="Producto del catálogo…"
        emptyMessage="No hay productos que coincidan."
        footer={(
          <button type="button" onClick={() => setCreating(true)} className="text-xs font-medium text-[#0056b3] hover:underline">
            + Crear producto
          </button>
        )}
      />
      {!selected && (
        <p className="mt-1.5 inline-block text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">Sin vincular: busca y elige un registro de la lista.</p>
      )}
      {!selected && suggested.length > 0 && (
        <p className="mt-1.5 text-[11px] text-gray-500">
          Posibles:{' '}
          {suggested.map((p) => (
            <button key={p.product_id} type="button" onClick={() => onSelect(p)} className="text-[#0056b3] hover:underline mr-2">{p.code} — {p.name}</button>
          ))}
        </p>
      )}
      {!selected && (
        <button type="button" onClick={() => setCreating(true)} className="block mt-1 text-[11px] font-medium text-[#0056b3] hover:underline">+ Crear producto</button>
      )}
      {creating && (
        <CreateProductModal
          projectId={projectId}
          prefill={prefill}
          onClose={() => setCreating(false)}
          onCreated={(product) => { onCreated(product); onSelect(product); setCreating(false); }}
        />
      )}
    </div>
  );
};

export default ProductPicker;
