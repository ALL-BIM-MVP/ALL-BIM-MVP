import React, { useState, useMemo, useEffect } from 'react';
import {
  Search, ChevronDown, ChevronUp, ChevronRight, X as XIcon,
  Info, History, Box, Layers, Tag, ListTree, Shapes, Link2, Copy, Check,
} from 'lucide-react';
import type { ParamIndexEntry } from '../hooks/useModelLoader';
import type { SelectedEntity } from '../types';
import { formatTypeName } from '../CategoryFilterPanel';

interface PropertiesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  paramIndex: ParamIndexEntry[];
  entity: SelectedEntity | null;
  onSelectResult: (expressId: number) => void;
  onDeselect: () => void;
}

const SECTION_ICONS: Record<string, React.ReactNode> = {
  caracteristicas: <Info size={15} />,
  historial: <History size={15} />,
  material: <Box size={15} />,
  capa: <Layers size={15} />,
  clasificacion: <Tag size={15} />,
  propiedades: <ListTree size={15} />,
  tipo: <Shapes size={15} />,
  definidopor: <Link2 size={15} />,
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-3 text-xs px-1.5 py-1">
    <span className="text-gray-500">{label}</span>
    <span className="text-[#0056b3] text-right truncate max-w-[160px] font-medium">{value || '—'}</span>
  </div>
);

// Botón chiquito de copiar — usado en el header para GUID/ID interno
// (punto 6 de pendientes-sin-definir-frontend.md: antes se mostraban
// crudos, sin ninguna etiqueta ni forma fácil de copiarlos).
const CopyIdButton: React.FC<{ value: string }> = ({ value }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          // El portapapeles puede fallar (permiso denegado, contexto no
          // seguro) — no es crítico, el valor sigue visible para
          // seleccionarlo a mano.
        }
      }}
      title="Copiar"
      className="text-gray-300 hover:text-[#0056b3] transition-colors flex-shrink-0"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
};

const SectionHeader: React.FC<{
  id: string;
  label: string;
  count?: number;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
}> = ({ id, label, count, collapsed, onToggle }) => {
  const isCollapsed = collapsed.has(id);
  return (
    <button
      onClick={() => onToggle(id)}
      className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100"
    >
      {isCollapsed ? <ChevronRight size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
      <span className="text-gray-500">{SECTION_ICONS[id]}</span>
      <span className="text-xs font-medium text-gray-700 flex-1 text-left">{label}</span>
      {count !== undefined && <span className="text-[10px] text-gray-400">{count}</span>}
    </button>
  );
};

const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  isOpen, onClose, paramIndex, entity, onSelectResult, onDeselect,
}) => {
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(
    new Set(['caracteristicas', 'historial', 'material', 'capa', 'clasificacion', 'propiedades', 'tipo', 'definidopor'])
  );
  // Todo el bloque de detalles (búsqueda por parámetro + las 8 secciones)
  // arranca oculto detrás de este toggle — por defecto solo se ve el
  // nombre y el GUID del elemento en el header. Se resetea a cerrado
  // cada vez que cambia el elemento seleccionado.
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  useEffect(() => {
    setDetailsExpanded(false);
  }, [entity?.expressId]);

  const toggle = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const globalResults = useMemo(() => {
    if (entity || !query.trim()) return [];
    const q = query.toLowerCase();
    const matches = paramIndex.filter(
      (p) => p.paramName.toLowerCase().includes(q) || p.paramValue.toLowerCase().includes(q)
    );
    const grouped = new Map<number, { expressId: number; elementName: string; typeName: string; matches: { paramName: string; paramValue: string }[] }>();
    for (const m of matches) {
      if (!grouped.has(m.expressId)) {
        grouped.set(m.expressId, { expressId: m.expressId, elementName: m.elementName, typeName: m.typeName, matches: [] });
      }
      grouped.get(m.expressId)!.matches.push({ paramName: m.paramName, paramValue: m.paramValue });
    }
    return Array.from(grouped.values()).slice(0, 30);
  }, [paramIndex, query, entity]);

  const elementParams = useMemo(() => {
    if (!entity) return [];

    if (entity.propertySets && entity.propertySets.length > 0) {
      const params: { category: string; paramName: string; paramValue: string }[] = [];
      for (const pset of entity.propertySets) {
        for (const prop of pset.properties || []) {
          params.push({
            category: pset.name,
            paramName: prop.name,
            paramValue: String(prop.value),
          });
        }
      }
      return params;
    }

    return paramIndex
      .filter((p) => p.expressId === entity.expressId)
      .map((p) => ({ category: p.category, paramName: p.paramName, paramValue: p.paramValue }));
  }, [entity, paramIndex]);

  const { grouped, totalMatches } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? elementParams.filter((p) => p.paramName.toLowerCase().includes(q) || p.paramValue.toLowerCase().includes(q))
      : elementParams;
    const map = new Map<string, { paramName: string; paramValue: string }[]>();
    for (const p of filtered) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push({ paramName: p.paramName, paramValue: p.paramValue });
    }
    return { grouped: map, totalMatches: filtered.length };
  }, [elementParams, query]);

  const categories = Array.from(grouped.keys());

  if (!isOpen) return null;

  const showSearchAndSections = !entity || detailsExpanded;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-2xl w-80 max-h-[440px] flex flex-col overflow-hidden">
      <div className="flex items-start justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        {entity ? (
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{entity.name}</p>
            {/* GUID primero — es el identificador que se conoce desde
                Revit, más familiar que el ID interno del IFC. Los dos
                etiquetados y copiables (antes se mostraban crudos, uno
                al lado del otro, sin decir cuál era cuál). */}
            {entity.globalId && (
              <p className="text-[11px] text-gray-400 flex items-center gap-1 min-w-0">
                <span className="text-gray-300 flex-shrink-0">GUID:</span>
                <span className="font-mono truncate">{entity.globalId}</span>
                <CopyIdButton value={entity.globalId} />
              </p>
            )}
            <p className="text-[11px] text-gray-400 flex items-center gap-1 min-w-0">
              <span className="text-gray-300 flex-shrink-0">ID interno:</span>
              <span className="font-mono truncate">#{entity.expressId}</span>
              <CopyIdButton value={String(entity.expressId)} />
            </p>
          </div>
        ) : (
          <p className="text-sm font-semibold text-gray-800">Buscar en el modelo</p>
        )}
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex-shrink-0 ml-2">
          <XIcon size={16} />
        </button>
      </div>

      {entity && (
        <button
          onClick={() => setDetailsExpanded((prev) => !prev)}
          className="flex items-center justify-center gap-1.5 w-full px-4 py-2 text-xs font-medium text-[#0056b3] hover:bg-blue-50 transition-colors border-b border-gray-100 flex-shrink-0"
        >
          {detailsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {detailsExpanded ? 'Ocultar detalles' : 'Ver detalles'}
        </button>
      )}

      {showSearchAndSections && (
        <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5">
            <Search size={14} className="text-gray-400 flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={entity ? 'Buscar parámetro o valor...' : 'Buscar en todo el modelo...'}
              className="bg-transparent text-xs text-gray-800 placeholder-gray-400 outline-none w-full"
              autoFocus
            />
          </div>
          {entity && (
            <button onClick={onDeselect} className="text-[11px] text-[#0056b3] hover:underline mt-1.5">
              ← Volver a la búsqueda general
            </button>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!entity && (
          <>
            {!query.trim() && (
              <p className="text-xs text-gray-400 text-center py-6">Escribí para buscar en todo el modelo</p>
            )}
            {query.trim() && globalResults.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">Sin resultados</p>
            )}
            {globalResults.map((r) => (
              <button
                key={r.expressId}
                onClick={() => onSelectResult(r.expressId)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100 transition-colors"
              >
                <p className="text-xs font-semibold text-gray-700 truncate">{r.elementName}</p>
                <p className="text-[10px] text-gray-400">{formatTypeName(r.typeName)}</p>
                {r.matches.slice(0, 2).map((m, i) => (
                  <p key={i} className="text-[10px] text-[#0056b3] mt-0.5 truncate">
                    {m.paramName}: {m.paramValue}
                  </p>
                ))}
              </button>
            ))}
          </>
        )}

        {entity && detailsExpanded && (
          <>
            <SectionHeader id="caracteristicas" label="Características" count={4} collapsed={collapsed} onToggle={toggle} />
            {!collapsed.has('caracteristicas') && (
              <div className="px-4 pb-2">
                <Row label="Nombre" value={entity.name} />
                <Row label="GUID" value={entity.globalId} />
                <Row label="Descripción" value={entity.description} />
                <Row label="Tipo de objeto" value={entity.objectType} />
                <Row label="Tag" value={entity.tag} />
              </div>
            )}

            <SectionHeader id="historial" label="Historial de creación" collapsed={collapsed} onToggle={toggle} />
            {!collapsed.has('historial') && (
              <div className="px-4 pb-2">
                {entity.ownerHistory ? (
                  <>
                    <Row label="Fecha de creación" value={entity.ownerHistory.creationDate} />
                    <Row label="Usuario" value={entity.ownerHistory.owningUser} />
                    <Row label="Aplicación" value={entity.ownerHistory.owningApplication} />
                  </>
                ) : (
                  <p className="text-[11px] text-gray-400 py-1.5">No disponible</p>
                )}
              </div>
            )}

            <SectionHeader id="material" label="Material" count={entity.materials?.length || undefined} collapsed={collapsed} onToggle={toggle} />
            {!collapsed.has('material') && (
              <div className="px-4 pb-2">
                {entity.materials && entity.materials.length > 0 ? (
                  entity.materials.map((m, i) => <Row key={i} label={`Material ${i + 1}`} value={m} />)
                ) : (
                  <p className="text-[11px] text-gray-400 py-1.5">No disponible</p>
                )}
              </div>
            )}

            <SectionHeader id="capa" label="Capa" collapsed={collapsed} onToggle={toggle} />
            {!collapsed.has('capa') && (
              <div className="px-4 pb-2"><p className="text-[11px] text-gray-400 py-1.5">No disponible</p></div>
            )}

            <SectionHeader id="clasificacion" label="Clasificación" collapsed={collapsed} onToggle={toggle} />
            {!collapsed.has('clasificacion') && (
              <div className="px-4 pb-2"><p className="text-[11px] text-gray-400 py-1.5">No disponible</p></div>
            )}

            <SectionHeader id="propiedades" label="Propiedades" count={entity.loadingDetails ? undefined : elementParams.length} collapsed={collapsed} onToggle={toggle} />
            {!collapsed.has('propiedades') && (
              <div className="pb-2">
                {entity.loadingDetails ? (
                  <p className="text-[11px] text-gray-400 text-center py-3">Cargando...</p>
                ) : categories.length === 0 ? (
                  <p className="text-[11px] text-gray-400 text-center py-3">
                    {query.trim() ? 'Sin resultados' : 'Sin parámetros indexados'}
                  </p>
                ) : (
                  categories.map((category) => (
                    <div key={category} className="px-4 pb-1.5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{category}</p>
                      {grouped.get(category)!.map((p, i) => <Row key={i} label={p.paramName} value={p.paramValue} />)}
                    </div>
                  ))
                )}
                <p className="text-[10px] text-gray-400 px-4 pt-1">
                  {totalMatches} de {elementParams.length} parámetros
                </p>
              </div>
            )}

            <SectionHeader id="tipo" label="Características del tipo" collapsed={collapsed} onToggle={toggle} />
            {!collapsed.has('tipo') && (
              <div className="px-4 pb-2"><p className="text-[11px] text-gray-400 py-1.5">No disponible</p></div>
            )}

            <SectionHeader id="definidopor" label="Definido por" collapsed={collapsed} onToggle={toggle} />
            {!collapsed.has('definidopor') && (
              <div className="px-4 pb-2"><p className="text-[11px] text-gray-400 py-1.5">No disponible</p></div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default PropertiesPanel;