// src/components/tabs/PartidasTree.tsx
import React, { useEffect, useState, useCallback } from 'react';

import { ChevronRight, ChevronDown, ChevronLeft, Loader2, AlertTriangle, Folder, FolderOpen, Ruler, SlidersHorizontal, Save, Trash2, Info, Focus } from 'lucide-react';

import {
  PartidaNode,
  getPartidasTree,
  getPartidaElements,
} from '../../../services/ifcfiles.service';
import { useTemplates } from '../../../hooks/useTemplates';
import {
  templateColumnsToPartidaRequest,
  toTemplateSetsInput,
  replaceTemplateColumns,
  deleteTemplate,
} from '../../../services/templates.service';
import type { PartidaDetail, PartidaGroup } from '../../../services/ifcfiles.service';
import type { TemplateFull, TemplateSet } from '../../../services/templates.service';
import TemplateSelector from './Templates/TemplateSelector';
import TemplateEditor from './Templates/TemplateEditor';
import MetradosTable from './Templates/MetradosTable';

interface PartidasTreeProps {
  ifcFileId: string;
  currentUserId?: number;
  onSelectAllInViewer?: (expressIds: number[], globalIds?: (string | null)[]) => void;
  onSelectGroupInViewer?: (expressIds: number[], globalIds?: (string | null)[]) => void;
  onClearSelectionInViewer?: () => void;
 
  focusPartida?: { partida_id: number; code: string; description: string; unit: string | null; expressId: number } | null;
  onFocusPartidaHandled?: () => void;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('es-PE', { maximumFractionDigits: 4 });
}

// Pantalla de detalle: reemplaza el árbol al hacer click en una partida hoja.
const PartidaDetailScreen: React.FC<{
  ifcFileId: string;
  node: PartidaNode;
  currentUserId: number;
  onBack: () => void;

  onSelectGroupInViewer?: (expressIds: number[], globalIds?: (string | null)[]) => void;
  onSelectAllInViewer?: (expressIds: number[], globalIds?: (string | null)[]) => void;
  onClearSelectionInViewer?: () => void;
 
  focusExpressId?: number | null;
}> = ({ ifcFileId, node, currentUserId, onBack, onSelectGroupInViewer, onSelectAllInViewer, onClearSelectionInViewer, focusExpressId }) => {
  const [detail, setDetail] = useState<PartidaDetail | null>(null);

  const [partidaIsolated, setPartidaIsolated] = useState(true);
  
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'edit' | 'create'>('edit');
  const [quickSaving, setQuickSaving] = useState(false);
  const [previewSets, setPreviewSets] = useState<TemplateSet[] | null>(null);

  const {
    templates,
    activeTemplate,
    loadingActive,
    selectTemplate,
    refreshList,
    setActiveTemplateLocal,
  } = useTemplates();

  const effectiveSets = previewSets ?? activeTemplate?.sets ?? [];
  const displayTemplate: TemplateFull | null = activeTemplate
    ? { ...activeTemplate, sets: effectiveSets }
    : null;

  const isOwn =
    !!activeTemplate && !activeTemplate.is_system && activeTemplate.created_by === currentUserId;

  const handleQuickSave = useCallback(async () => {
    if (!isOwn || !activeTemplate) return;
    setQuickSaving(true);
    try {
      const updated = await replaceTemplateColumns(
        activeTemplate.template_id,
        toTemplateSetsInput(effectiveSets)
      );
      await refreshList();
      setActiveTemplateLocal(updated);
      setPreviewSets(null);
    } catch (err: any) {
      alert(err.message || 'No se pudo guardar la plantilla.');
    } finally {
      setQuickSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwn, activeTemplate, effectiveSets]);

  const handleQuickDelete = useCallback(async () => {
    if (!isOwn || !activeTemplate) return;
    if (!window.confirm(`¿Borrar la plantilla "${activeTemplate.name}"? No se puede deshacer.`)) return;
    setQuickSaving(true);
    try {
      await deleteTemplate(activeTemplate.template_id);
      setPreviewSets(null);
      const list = await refreshList();
      const fallback = list.find((t) => t.is_default) ?? list[0];
      if (fallback) await selectTemplate(fallback.template_id);
    } catch (err: any) {
      alert(err.message || 'No se pudo borrar la plantilla.');
    } finally {
      setQuickSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwn, activeTemplate]);

  const handleReorderColumn = useCallback(
    (setIndex: number, fromColIndex: number, toColIndex: number) => {
      const orderedSets = [...effectiveSets].sort((a, b) => a.sort_order - b.sort_order);
      const target = orderedSets[setIndex];
      if (!target) return;

      const visible = [...target.columns]
        .filter((c) => c.is_visible)
        .sort((a, b) => a.column_order - b.column_order);
      if (fromColIndex < 0 || fromColIndex >= visible.length) return;
      if (toColIndex < 0 || toColIndex >= visible.length) return;

      const [moved] = visible.splice(fromColIndex, 1);
      visible.splice(toColIndex, 0, moved);

      const hidden = target.columns.filter((c) => !c.is_visible);
      const reordered = [...visible.map((c, i) => ({ ...c, column_order: i + 1 })), ...hidden];

      const newSets = orderedSets.map((s, i) => (i === setIndex ? { ...s, columns: reordered } : s));
      setPreviewSets(newSets);
    },
    [effectiveSets]
  );

  
  useEffect(() => {
    setPartidaIsolated(true);
    setSelectedGroupIndex(null);
  }, [node.partida_id]);


  const handleToggleIsolatePartida = useCallback(() => {
    if (!detail || !onSelectAllInViewer) return;
    if (partidaIsolated) {
      onSelectAllInViewer([]);
      setPartidaIsolated(false);
    } else {
      const expressIds = detail.groups.flatMap((g) => g.elements.map((el) => Number(el.express_id)));
      const globalIds = detail.groups.flatMap((g) => g.elements.map((el) => el.global_id));
      onSelectAllInViewer(expressIds, globalIds);
      setPartidaIsolated(true);
    }
    onClearSelectionInViewer?.();
    setSelectedGroupIndex(null);
  }, [detail, partidaIsolated, onSelectAllInViewer, onClearSelectionInViewer]);


  const handleToggleSelectGroup = useCallback(
    (group: PartidaGroup, index: number) => {
      if (selectedGroupIndex === index) {
        onClearSelectionInViewer?.();
        setSelectedGroupIndex(null);
      } else if (onSelectGroupInViewer) {
        if (detail && onSelectAllInViewer) {
          const allIds = detail.groups.flatMap((g) => g.elements.map((el) => Number(el.express_id)));
          const allGlobalIds = detail.groups.flatMap((g) => g.elements.map((el) => el.global_id));
          onSelectAllInViewer(allIds, allGlobalIds);
          setPartidaIsolated(true);
        }
        const expressIds = group.elements.map((el) => Number(el.express_id));
        const globalIds = group.elements.map((el) => el.global_id);
        onSelectGroupInViewer(expressIds, globalIds);
        setSelectedGroupIndex(index);
      }
    },
    [detail, selectedGroupIndex, onSelectGroupInViewer, onSelectAllInViewer, onClearSelectionInViewer]
  );

  useEffect(() => {
    if (!detail || focusExpressId == null) return;
    const index = detail.groups.findIndex((g) =>
      g.elements.some((el) => Number(el.express_id) === focusExpressId)
    );
    if (index === -1) return;
    setSelectedGroupIndex(index);
    document.getElementById(`metrado-row-${index}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [detail, focusExpressId]);

  const loadDetail = useCallback(
    (sets: TemplateSet[]) => {
      setLoading(true);
      setError(null);

      const columns = templateColumnsToPartidaRequest(sets);
      getPartidaElements(ifcFileId, node.partida_id, {
        columns: columns.length > 0 ? columns : undefined,
      })
        .then((d) => setDetail(d))
        .catch((err: any) => setError(err.message || 'Error al cargar el detalle de la partida.'))
        .finally(() => setLoading(false));
    },
    [ifcFileId, node.partida_id]
  );

  const propertyColumnsSignature = JSON.stringify(templateColumnsToPartidaRequest(effectiveSets));

  useEffect(() => {
    if (loadingActive) return;
    if (!activeTemplate) return;
    loadDetail(effectiveSets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.partida_id, activeTemplate?.template_id, loadingActive, propertyColumnsSignature]);

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={onBack}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
            title="Volver al árbol"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-xs font-bold text-black truncate leading-tight min-w-0">
                {node.code} · {node.description}
              </p>
              <span
                title="Partida: ítem de medición de obra — agrupa los elementos del modelo que comparten este código, con su metrado total."
                className="flex-shrink-0"
              >
                <Info size={12} className="text-gray-400 cursor-help" />
              </span>
            </div>
            {detail && (
              <p className="text-[9px] text-gray-500 leading-tight truncate">
                {detail.groups.length} grupo(s) · total {formatNumber(detail.total)} {node.unit}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 mr-3">
          {onSelectAllInViewer && (
            <button
              onClick={handleToggleIsolatePartida}
              disabled={!detail}
              title={
                partidaIsolated
                  ? 'Mostrar todo el modelo de nuevo (quitar aislamiento de esta partida)'
                  : 'Aislar toda la partida en el visor 3D'
              }
              className={`w-6 h-6 flex items-center justify-center rounded border transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                partidaIsolated
                  ? 'bg-[#0056b3] border-[#0056b3] text-white'
                  : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              <Focus size={13} />
            </button>
          )}
          <TemplateSelector
            templates={templates}
            activeTemplateId={activeTemplate?.template_id ?? null}
            loading={loadingActive}
            onSelect={(id) => {
              setPreviewSets(null);
              selectTemplate(id);
            }}
          />
          <span title="Plantilla: define qué columnas se muestran acá (propiedades del IFC, además de las columnas fijas).">
            <Info size={12} className="text-gray-400 cursor-help" />
          </span>
          <button
            onClick={() => {
              setEditorMode('create');
              setEditorOpen(true);
            }}
            title="Nueva plantilla (copia de la activa, totalmente editable)"
            className="text-[10px] font-semibold px-2 py-1 rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0 whitespace-nowrap"
          >
            Plantilla nueva
          </button>
          <button
            onClick={() => {
              setEditorMode('edit');
              setEditorOpen(true);
            }}
            title="Mostrar/ocultar u agregar columnas de vista"
            className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            <SlidersHorizontal size={12} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 min-h-0 py-10 text-center text-gray-400">
          <Loader2 size={20} className="animate-spin mx-auto mb-2" />
          <p className="text-sm">Cargando detalle...</p>
        </div>
      ) : error ? (
        <div className="flex-1 min-h-0 py-10 text-center text-red-500">
          <AlertTriangle size={20} className="mx-auto mb-2" />
          <p className="text-sm">{error}</p>
        </div>
      ) : !detail || detail.groups.length === 0 ? (
        <div className="flex-1 min-h-0 py-10 text-center text-gray-400">
          <p className="text-sm">Sin elementos en esta partida.</p>
        </div>
      ) : displayTemplate ? (
        <MetradosTable
          template={displayTemplate}
          detail={detail}
          code={node.code}
          description={node.description}
          unit={node.unit}
          onReorderColumn={handleReorderColumn}
          onToggleGroupSelect={handleToggleSelectGroup}
          selectedGroupIndex={selectedGroupIndex}
        />
      ) : (
        <div className="flex-1 min-h-0 py-10 text-center text-gray-400">
          <AlertTriangle size={20} className="mx-auto mb-2 text-amber-500" />
          <p className="text-sm">No se pudo cargar ninguna plantilla de columnas.</p>
          <p className="text-xs mt-1">Revisá la pestaña Network (F12) el request a /api/templates.</p>
        </div>
      )}

      {isOwn && !loading && (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-2 bg-white border-r border-b border-gray-200 rounded-full shadow-xl px-2 py-2">
          <button
            onClick={handleQuickSave}
            disabled={quickSaving}
            title="Guardar plantilla"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-[#0056b3] text-white hover:bg-[#004494] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
          >
            {quickSaving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
          </button>
          <button
            onClick={handleQuickDelete}
            disabled={quickSaving}
            title="Borrar plantilla"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
          >
            <Trash2 size={17} />
          </button>
        </div>
      )}

      {editorOpen && (
        <TemplateEditor
          source={activeTemplate}
          currentUserId={currentUserId}
          ifcFileId={ifcFileId}
          forceEditable={editorMode === 'create'}
          onChange={setPreviewSets}
          onSaved={async (saved) => {
            await refreshList();
            setActiveTemplateLocal(saved);
            setPreviewSets(null);
            setEditorOpen(false);
          }}
          onDeleted={async () => {
            await refreshList();
            setPreviewSets(null);
            setEditorOpen(false);
          }}
          onClose={() => {
            setEditorOpen(false);
          }}
        />
      )}
    </div>
  );
};

const PartidaTableRow: React.FC<{
  node: PartidaNode;
  depth: number;
  onSelectLeaf: (node: PartidaNode) => void;
  isolatingPartidaId: number | null;
  expandedIds: Set<number>;
  onToggleExpand: (partidaId: number) => void;
  lastSelectedPartidaId: number | null;
}> = ({ node, depth, onSelectLeaf, isolatingPartidaId, expandedIds, onToggleExpand, lastSelectedPartidaId }) => {
  const isLeaf = node.unit !== null;
  const hasChildren = node.children && node.children.length > 0;
  const isIsolating = isolatingPartidaId === node.partida_id;
  const expanded = expandedIds.has(node.partida_id);
  const isLastSelected = isLeaf && lastSelectedPartidaId === node.partida_id;

  const handleClick = () => {
    if (isLeaf) {
      onSelectLeaf(node);
    } else if (hasChildren) {
      onToggleExpand(node.partida_id);
    }
  };

  return (
    <>
      <tr className={
        isLastSelected
          ? 'bg-blue-50 hover:bg-blue-50 ring-1 ring-inset ring-[#0056b3]/30'
          : isLeaf ? 'bg-white hover:bg-gray-50' : 'bg-gray-100/70 hover:bg-gray-200/60'
      }>
        <td className="px-2.5 py-2 align-top border-r border-b border-gray-200" style={{ paddingLeft: 12 + depth * 18 }}>
          <button
            onClick={handleClick}
            title={isLeaf ? 'Ver tabla y aislar en el visor 3D' : undefined}
            className="inline-flex items-center gap-2 text-left cursor-pointer"
          >
            <span className="w-3.5 flex-shrink-0 text-gray-400">
              {!isLeaf && hasChildren ? (
                expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
              ) : null}
            </span>
            {isIsolating ? (
              <Loader2 size={14} className="text-[#0056b3] flex-shrink-0 animate-spin" />
            ) : isLeaf ? (
              <Ruler size={14} className="text-[#0056b3] flex-shrink-0" />
            ) : expanded ? (
              <FolderOpen size={14} className="text-amber-500 flex-shrink-0" />
            ) : (
              <Folder size={14} className="text-amber-400 flex-shrink-0" />
            )}
            <span className="text-[11px] font-mono text-gray-500">{node.code}</span>
          </button>
        </td>
        <td className={`px-2.5 py-2 align-top border-r border-b border-gray-200 text-xs ${isLeaf ? 'text-black' : 'text-black font-bold'}`}>
          {node.description}
        </td>
        <td className="px-2.5 py-2 align-top border-r border-b border-gray-200 text-xs text-gray-600">
          {node.unit ?? '—'}
        </td>
        <td className="px-2.5 py-2 align-top border-r border-b border-gray-200 text-xs text-gray-600 text-right">
          {formatNumber(node.element_count)}
        </td>
        <td className="px-2.5 py-2 align-top border-r border-b border-gray-200 text-xs font-semibold text-gray-800 text-right">
          {formatNumber(node.total)}
        </td>
      </tr>

      {expanded && hasChildren && (
        <>
          {node.children.map((child) => (
            <PartidaTableRow
              key={child.partida_id}
              node={child}
              depth={depth + 1}
              onSelectLeaf={onSelectLeaf}
              isolatingPartidaId={isolatingPartidaId}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              lastSelectedPartidaId={lastSelectedPartidaId}
            />
          ))}
        </>
      )}
    </>
  );
};

// Componente principal: alterna entre árbol y pantalla de detalle.
const PartidasTree: React.FC<PartidasTreeProps> = ({
  ifcFileId,
  currentUserId = -1,
  onSelectAllInViewer,
  onSelectGroupInViewer,
  onClearSelectionInViewer,
  focusPartida,
  onFocusPartidaHandled,
}) => {
  const [tree, setTree] = useState<PartidaNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<PartidaNode | null>(null);
  const [isolatingPartidaId, setIsolatingPartidaId] = useState<number | null>(null);


  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const toggleExpand = useCallback((partidaId: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(partidaId)) next.delete(partidaId);
      else next.add(partidaId);
      return next;
    });
  }, []);

  const [lastSelectedPartidaId, setLastSelectedPartidaId] = useState<number | null>(null);


  const [focusExpressId, setFocusExpressId] = useState<number | null>(null);

 
  useEffect(() => {
    if (!focusPartida) return;
    setSelectedNode({
      partida_id: focusPartida.partida_id,
      parent_id: null,
      code: focusPartida.code,
      description: focusPartida.description,
      unit: focusPartida.unit,
      sort_order: 0,
      element_count: 0,
      total: null,
      children: [],
    });
    setLastSelectedPartidaId(focusPartida.partida_id);
    setFocusExpressId(focusPartida.expressId);
    onFocusPartidaHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPartida]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPartidasTree(ifcFileId)
      .then((data) => {
        if (!cancelled) {
          setTree(data);
          setExpandedIds(new Set(data.map((n) => n.partida_id)));
        }
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Error al cargar las partidas.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ifcFileId]);

  const isolatePartidaInViewer = useCallback(
    async (node: PartidaNode) => {
      if (!onSelectAllInViewer) return;
      onClearSelectionInViewer?.();
      setIsolatingPartidaId(node.partida_id);
      try {
        const detail = await getPartidaElements(ifcFileId, node.partida_id);
        const expressIds = detail.groups.flatMap((g) => g.elements.map((el) => Number(el.express_id)));
        // global_id: paralelo a expressIds — lo necesita el visor
        // cuando el modelo cargó por Fragments, donde express_id no
        // identifica nada (numeración propia de Fragments, sin
        // relación con el IFC original) — ahí sí se puede traducir
        // GUID -> localId real (ver useFragmentsEntityVisibility.ts).
        const globalIds = detail.groups.flatMap((g) => g.elements.map((el) => el.global_id));

        onSelectAllInViewer(expressIds, globalIds);
      } catch (err: any) {
        alert(err.message || 'No se pudieron cargar los elementos de esta partida.');
      } finally {
        setIsolatingPartidaId(null);
      }
    },
    [ifcFileId, onSelectAllInViewer]
  );

  const handleSelectLeaf = useCallback(
    (node: PartidaNode) => {
      setSelectedNode(node);
      setLastSelectedPartidaId(node.partida_id);
      setFocusExpressId(null); // entrando por el árbol, ningún elemento puntual que señalar
      isolatePartidaInViewer(node);
    },
    [isolatePartidaInViewer]
  );

  const handleBack = useCallback(() => {
    setSelectedNode(null);
  }, []);

  if (selectedNode) {
    return (
      <PartidaDetailScreen
        ifcFileId={ifcFileId}
        node={selectedNode}
        currentUserId={currentUserId}
        onBack={handleBack}
        onSelectGroupInViewer={onSelectGroupInViewer}
        onSelectAllInViewer={onSelectAllInViewer}
        onClearSelectionInViewer={onClearSelectionInViewer}
        focusExpressId={focusExpressId}
      />
    );
  }

  if (loading) {
    return (
      <div className="py-10 text-center text-gray-400">
        <Loader2 size={20} className="animate-spin mx-auto mb-2" />
        <p className="text-sm">Cargando partidas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center text-red-500">
        <AlertTriangle size={20} className="mx-auto mb-2" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (!tree || tree.length === 0) {
    return (
      <div className="py-10 text-center text-gray-400">
        <p className="text-sm">No se encontraron partidas para este archivo.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto rounded border border-gray-300">
        <table className="w-full text-[11px] border-separate border-spacing-0 min-w-[600px]">
          <thead>
            <tr className="bg-gray-100">
              <th className="sticky top-0 z-20 px-2.5 py-2 text-left font-semibold text-black bg-gray-100 border-r border-b border-gray-300">Código</th>
              <th className="sticky top-0 z-20 px-2.5 py-2 text-left font-semibold text-black bg-gray-100 border-r border-b border-gray-300">Descripción</th>
              <th className="sticky top-0 z-20 px-2.5 py-2 text-left font-semibold text-black bg-gray-100 border-r border-b border-gray-300">Unidad</th>
              <th className="sticky top-0 z-20 px-2.5 py-2 text-right font-semibold text-black bg-gray-100 border-r border-b border-gray-300">Cant.</th>
              <th className="sticky top-0 z-20 px-2.5 py-2 text-right font-semibold text-black bg-gray-100 border-r border-b border-gray-300">Total</th>
            </tr>
          </thead>
          <tbody>
            {tree.map((node) => (
              <PartidaTableRow
                key={node.partida_id}
                node={node}
                depth={0}
                onSelectLeaf={handleSelectLeaf}
                isolatingPartidaId={isolatingPartidaId}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                lastSelectedPartidaId={lastSelectedPartidaId}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default React.memo(PartidasTree);