import React, { useEffect, useState } from 'react';
import { Search, Warehouse, Rows3, Box } from 'lucide-react';
import { locationSearchService } from '../../../../services/almacen/locationSearch.service';
import { LocationSearchResult } from '../../../../types/almacen.types';

interface BuscarUbicacionProps {
  projectId: number;
}

const TYPE_ICON: Record<LocationSearchResult['type'], React.ElementType> = {
  warehouse: Warehouse,
  rack: Rows3,
  bin: Box,
};

const TYPE_LABEL: Record<LocationSearchResult['type'], string> = {
  warehouse: 'Almacén',
  rack: 'Estante',
  bin: 'Casilla',
};

const BuscarUbicacion: React.FC<BuscarUbicacionProps> = ({ projectId }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LocationSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Busca en vivo con un pequeño debounce — sin esto, cada tecla dispara un request.
  useEffect(() => {
    if (!projectId) return;
    const text = q.trim();
    if (!text) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(() => {
      locationSearchService
        .search(projectId, text)
        .then((rows) => {
          setResults(rows);
          setSearched(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timeout);
  }, [q, projectId]);

  return (
    <div className="h-full overflow-y-auto p-6 @container">
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5 max-w-4xl">
        <h1 className="text-xl font-bold text-gray-800">Buscar ubicación</h1>
        <p className="text-xs text-gray-400 mb-4">Buscá por nombre entre almacenes, estantes y casillas de todo el proyecto.</p>

        <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 mb-4">
          <Search size={15} className="text-gray-400 flex-shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ej. Almacén Grande, Estante 2, bahía 1..."
            className="bg-transparent text-sm outline-none flex-1 placeholder-gray-400"
            autoFocus
          />
        </div>

        {loading && <p className="text-sm text-gray-400">Buscando...</p>}
        {!loading && searched && results.length === 0 && (
          <p className="text-sm text-gray-300 text-center py-6">Sin resultados para "{q.trim()}".</p>
        )}
        {!loading && !searched && (
          <p className="text-sm text-gray-300 text-center py-6">Escribí algo para empezar a buscar.</p>
        )}

        <div className="grid grid-cols-1 @lg:grid-cols-2 gap-1.5">
          {!loading && results.map((r, i) => {
            const Icon = TYPE_ICON[r.type];
            return (
              <div key={`${r.type}-${r.warehouse_id}-${r.rack_id}-${r.bin_id}-${i}`} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2.5">
                <span className="flex-shrink-0 bg-blue-50 text-[#0056b3] rounded-lg p-1.5">
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                  <p className="text-xs text-gray-400 truncate">{TYPE_LABEL[r.type]} · {r.path}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default BuscarUbicacion;
