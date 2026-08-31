import React, { useMemo, useState } from 'react';
import { X as XIcon, Layers, Building2 } from 'lucide-react';
import type { TypeGroup, LevelGroup } from './types';

interface CategoryFilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  typeGroups: TypeGroup[];
  selectedTypes: Set<string>;
  toggleSelectType: (type: string) => void;
  clearSelectedTypes: () => void;
  levelGroups: LevelGroup[];
  selectedLevels: Set<string>;
  toggleSelectLevel: (level: string) => void;
  clearSelectedLevels: () => void;
}

type FilterMode = 'categorias' | 'niveles';

// Exportada para que PropertiesPanel.tsx la reuse en los resultados de
// búsqueda (antes mostraban el tipo IFC crudo, ej. "WALLSTANDARDCASE" —
// punto 6 de pendientes-sin-definir-frontend.md) en vez de duplicar
// esta misma lógica ahí.
export function formatTypeName(type: string): string {
  const stripped = type.replace(/^IFC/i, '');
  const spaced = stripped.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// "Sin nivel" siempre al final de la lista — no es un piso real, es el
// resto (elementos sin IfcBuildingStorey asociado), no tiene sentido
// que compita alfabéticamente con los pisos de verdad.
function sortLevelLabel(a: string, b: string): number {
  if (a === 'Sin nivel') 
    return 1;
  if (b === 'Sin nivel') 
    return -1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

const CategoryFilterPanel: React.FC<CategoryFilterPanelProps> = ({
  isOpen, onClose,
  typeGroups, selectedTypes, toggleSelectType, clearSelectedTypes,
  levelGroups, selectedLevels, toggleSelectLevel, clearSelectedLevels,
}) => {
  const [mode, setMode] = useState<FilterMode>('categorias');

  const sortedGroups = useMemo(
    () =>
      [...typeGroups]
        .map((g) => ({ ...g, label: formatTypeName(g.type) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [typeGroups]
  );

  // Misma lógica que sortedGroups (typeGroups) — acá el "type" ya ES el
  // nombre del nivel (ver classifyLevels en ifcWorker.ts), no hace falta
  // reformatearlo como IFCWALL -> "Wall".
  const sortedLevels = useMemo(
    () =>
      [...levelGroups]
        .map((g) => ({ ...g, label: g.type }))
        .sort((a, b) => sortLevelLabel(a.label, b.label)),
    [levelGroups]
  );

  if (!isOpen) return null;

  const isCategorias = mode === 'categorias';
  const activeGroups = isCategorias ? sortedGroups : sortedLevels;
  const activeSelected = isCategorias ? selectedTypes : selectedLevels;
  const activeToggle = isCategorias ? toggleSelectType : toggleSelectLevel;
  const activeClear = isCategorias ? clearSelectedTypes : clearSelectedLevels;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-56 max-h-[440px] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          {isCategorias ? <Layers size={15} className="text-gray-500" /> : <Building2 size={15} className="text-gray-500" />}
          <p className="text-sm font-semibold text-gray-800">{isCategorias ? 'Categorías' : 'Niveles'}</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
          <XIcon size={16} />
        </button>
      </div>

      {/* Categorías y niveles son excluyentes entre sí (ver useEntityVisibility:
          toggleSelectType/toggleSelectLevel se limpian mutuamente), así que
          cambiar de pestaña acá no combina ambos filtros — reemplaza uno por
          el otro, igual que pasa si tocás uno estando el otro activo. */}
      <div className="flex items-center gap-1 px-3 pt-2.5 pb-2 border-b border-gray-100 flex-shrink-0">
        <button
          onClick={() => setMode('categorias')}
          className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-colors ${
            isCategorias ? 'bg-[#0056b3] text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}
        >
          Categorías
        </button>
        <button
          onClick={() => setMode('niveles')}
          className={`flex-1 text-[11px] font-semibold py-1.5 rounded-lg transition-colors ${
            !isCategorias ? 'bg-[#0056b3] text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
          }`}
        >
          Por nivel
        </button>
      </div>

      <div className="px-4 py-2 border-b border-gray-100 flex-shrink-0">
        <button
          onClick={activeClear}
          disabled={activeSelected.size === 0}
          className={`flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
            activeSelected.size > 0
              ? 'bg-blue-50 text-[#0056b3] hover:bg-blue-100 cursor-pointer'
              : 'bg-transparent text-gray-300 cursor-default'
          }`}
        >
          <span>Filtro activo{activeSelected.size > 0 ? ` (${activeSelected.size})` : ''}</span>
          {activeSelected.size > 0 && <XIcon size={12} />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeGroups.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">
            {isCategorias ? 'Sin categorías' : 'Sin niveles detectados'}
          </p>
        )}
        {activeGroups.map((g) => (
          <label
            key={g.type}
            className="flex items-center gap-2.5 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={activeSelected.has(g.type)}
              onChange={() => activeToggle(g.type)}
              className="w-4 h-4 flex-shrink-0 rounded border-gray-300 text-[#0056b3] accent-[#0056b3]"
            />
            <span className="text-xs text-gray-700 truncate">{g.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
};

export default CategoryFilterPanel;
