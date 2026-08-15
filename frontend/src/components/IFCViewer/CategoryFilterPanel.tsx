import React, { useMemo } from 'react';
import { X as XIcon, Layers } from 'lucide-react';
import type { TypeGroup } from './types';

interface CategoryFilterPanelProps {
  isOpen: boolean;
  onClose: () => void;
  typeGroups: TypeGroup[];
  selectedTypes: Set<string>;
  toggleSelectType: (type: string) => void;
  clearSelectedTypes: () => void;
}

function formatTypeName(type: string): string {
  const stripped = type.replace(/^IFC/i, '');
  const spaced = stripped.replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced
    .toLowerCase()
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

const CategoryFilterPanel: React.FC<CategoryFilterPanelProps> = ({
  isOpen, onClose, typeGroups, selectedTypes, toggleSelectType, clearSelectedTypes,
}) => {
  const sortedGroups = useMemo(
    () =>
      [...typeGroups]
        .map((g) => ({ ...g, label: formatTypeName(g.type) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [typeGroups]
  );

  if (!isOpen) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-56 max-h-[440px] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Layers size={15} className="text-gray-500" />
          <p className="text-sm font-semibold text-gray-800">Categorías</p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
          <XIcon size={16} />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-gray-100 flex-shrink-0">
  <button
    onClick={clearSelectedTypes}
    disabled={selectedTypes.size === 0}
    className={`flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[11px] font-medium transition-colors ${
      selectedTypes.size > 0
        ? 'bg-blue-50 text-[#0056b3] hover:bg-blue-100 cursor-pointer'
        : 'bg-transparent text-gray-300 cursor-default'
    }`}
  >
    <span>Filtro activo{selectedTypes.size > 0 ? ` (${selectedTypes.size})` : ''}</span>
    {selectedTypes.size > 0 && <XIcon size={12} />}
  </button>
</div>

      <div className="flex-1 overflow-y-auto">
        {sortedGroups.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-6">Sin categorías</p>
        )}
        {sortedGroups.map((g) => (
          <label
            key={g.type}
            className="flex items-center gap-2.5 px-4 py-2 border-b border-gray-50 hover:bg-gray-50 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={selectedTypes.has(g.type)}
              onChange={() => toggleSelectType(g.type)}
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