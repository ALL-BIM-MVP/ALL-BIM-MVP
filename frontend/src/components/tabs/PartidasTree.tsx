// src/components/tabs/PartidasTree.tsx
//
// Árbol de partidas (GET /ifc-files/:id/partidas). Al hacer clic en una
// partida hoja (unit !== null), se reemplaza la vista completa por una
// pantalla de detalle (POST /ifc-files/:id/partidas/:partidaId/elements)
// con columnas de Identificación/Dimensiones/Metrado — con flecha
// "atrás" para volver al árbol.

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ChevronRight, ChevronDown, ChevronLeft, Loader2, AlertTriangle, Folder, FolderOpen, Ruler, SlidersHorizontal, CheckCircle2 } from 'lucide-react';
import {
  PartidaNode,
  PartidaDetail,
  PartidaGroup,
  getPartidasTree,
  getPartidaElements,
} from '../../services/ifcfiles.service';

interface PartidasTreeProps {
  ifcFileId: string;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('es-PE', { maximumFractionDigits: 4 });
}

// ============================================================
// PANTALLA DE DETALLE — reemplaza toda la vista (drill-down)
// ============================================================
const PartidaDetailScreen: React.FC<{
  ifcFileId: string;
  node: PartidaNode;
  onBack: () => void;
}> = ({ ifcFileId, node, onBack }) => {
  const [detail, setDetail] = useState<PartidaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    getPartidaElements(ifcFileId, node.partida_id)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Error al cargar el detalle de la partida.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // OJO: NO agregar detail/loading/error acá — ver la explicación en
    // el bug que se corrigió antes. Solo debe re-dispararse si cambia
    // de qué partida se pide el detalle.
  }, [ifcFileId, node.partida_id]);

  return (
    <div className="flex flex-col h-full">
      {/* Todo en una sola fila: atrás + título/subtítulo a la izquierda, selector de plantilla + config a la derecha */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={onBack}
            className="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors flex-shrink-0"
            title="Volver al árbol"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="min-w-0">
            <p className="text-xs font-bold text-black truncate leading-tight">
              {node.code} · {node.description}
            </p>
            {detail && (
              <p className="text-[9px] text-gray-500 leading-tight">
                {detail.groups.length} grupo(s) · total {formatNumber(detail.total)} {node.unit}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-gray-300 bg-white text-[10px] font-semibold text-gray-700 whitespace-nowrap">
            Detallado (default)
          </div>
          <button
            title="Configurar columnas (próximamente)"
            className="w-6 h-6 flex items-center justify-center rounded border border-gray-300 bg-white text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            <SlidersHorizontal size={12} />
          </button>
        </div>
      </div>

      {/* Contenido */}
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
      ) : (
        // Un solo contenedor con scroll en los dos ejes (no dos
        // anidados) — así el scrollbar horizontal queda pegado al
        // borde INFERIOR del área visible del panel, siempre a la
        // vista, en vez de quedar al final de todo el contenido de la
        // tabla (invisible hasta bajar del todo con el scroll vertical).
        <div className="flex-1 min-h-0 overflow-auto rounded border border-gray-300">
          <table className="w-full text-[10px] border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-gray-100">
                <th colSpan={3} className="px-2 py-1 text-left font-bold text-black border border-gray-300">
                  IDENTIFICACIÓN
                </th>
                <th colSpan={3} className="px-2 py-1 text-left font-bold text-black border border-gray-300">
                  DIMENSIONES
                </th>
                <th colSpan={5} className="px-2 py-1 text-left font-bold text-black border border-gray-300">
                  METRADO
                </th>
                <th className="px-2 py-1 border border-gray-300" />
                <th className="px-2 py-1 border border-gray-300" />
              </tr>
              <tr className="bg-gray-50">
                <th className="px-2 py-1.5 text-left font-semibold text-black border border-gray-300">ITEM</th>
                <th className="px-2 py-1.5 text-left font-semibold text-black border border-gray-300">DESCRIPCIÓN</th>
                <th className="px-2 py-1.5 text-left font-semibold text-black border border-gray-300">UND</th>
                <th className="px-2 py-1.5 text-right font-semibold text-black border border-gray-300">Largo</th>
                <th className="px-2 py-1.5 text-right font-semibold text-black border border-gray-300">Ancho</th>
                <th className="px-2 py-1.5 text-right font-semibold text-black border border-gray-300">Altura</th>
                <th className="px-2 py-1.5 text-right font-semibold text-black border border-gray-300">Longitud</th>
                <th className="px-2 py-1.5 text-right font-semibold text-black border border-gray-300">Cant.</th>
                <th className="px-2 py-1.5 text-right font-semibold text-black border border-gray-300">Área</th>
                <th className="px-2 py-1.5 text-right font-semibold text-black border border-gray-300">Vol.</th>
                <th className="px-2 py-1.5 text-right font-semibold text-black border border-gray-300">Kg.</th>
                <th className="px-2 py-1.5 text-right font-semibold text-black border border-gray-300">Sub Total</th>
                <th className="px-2 py-1.5 text-right font-semibold text-black border border-gray-300">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {detail.groups.map((group: PartidaGroup, i) => (
                <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="px-2 py-1.5 border border-gray-200 text-gray-700">{node.code}</td>
                  <td className="px-2 py-1.5 border border-gray-200 text-gray-700">{node.description}</td>
                  <td className="px-2 py-1.5 border border-gray-200 text-gray-600">{node.unit}</td>
                  <td className="px-2 py-1.5 border border-gray-200 text-gray-600 text-right">{formatNumber(group.length)}</td>
                  <td className="px-2 py-1.5 border border-gray-200 text-gray-600 text-right">{formatNumber(group.width)}</td>
                    <td className="px-2 py-1.5 border border-gray-200 text-gray-600 text-right">{formatNumber(group.height)}</td>
                    <td className="px-2 py-1.5 border border-gray-200 text-gray-600 text-right">{formatNumber(group.run_length)}</td>
                    <td className="px-2 py-1.5 border border-gray-200 text-gray-600 text-right">{formatNumber(group.quantity)}</td>
                    <td className="px-2 py-1.5 border border-gray-200 text-gray-600 text-right">{formatNumber(group.area)}</td>
                    <td className="px-2 py-1.5 border border-gray-200 text-gray-600 text-right">{formatNumber(group.volume)}</td>
                    <td className="px-2 py-1.5 border border-gray-200 text-gray-600 text-right">{formatNumber(group.weight)}</td>
                    <td className="px-2 py-1.5 border border-gray-200 text-gray-800 font-semibold text-right">{formatNumber(group.sub_total)}</td>
                    <td className="px-2 py-1.5 border border-gray-200 text-black font-bold text-right">{formatNumber(detail.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
};

// ============================================================
// FILA DEL ÁRBOL — carpetas se expanden inline; hojas navegan al detalle
// ============================================================
const PartidaTableRow: React.FC<{
  node: PartidaNode;
  depth: number;
  onSelectLeaf: (node: PartidaNode) => void;
}> = ({ node, depth, onSelectLeaf }) => {
  const [expanded, setExpanded] = useState(depth === 0);

  const isLeaf = node.unit !== null;
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = () => {
    if (isLeaf) {
      onSelectLeaf(node);
    } else if (hasChildren) {
      setExpanded((prev) => !prev);
    }
  };

  return (
    <>
      <tr className={isLeaf ? 'bg-white hover:bg-gray-50' : 'bg-gray-100/70 hover:bg-gray-200/60'}>
        <td className="px-2.5 py-2 align-top border border-gray-200" style={{ paddingLeft: 12 + depth * 18 }}>
          <button
            onClick={handleClick}
            className="inline-flex items-center gap-2 text-left cursor-pointer"
          >
            <span className="w-3.5 flex-shrink-0 text-gray-400">
              {!isLeaf && hasChildren ? (
                expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
              ) : null}
            </span>
            {isLeaf ? (
              <Ruler size={14} className="text-[#0056b3] flex-shrink-0" />
            ) : expanded ? (
              <FolderOpen size={14} className="text-amber-500 flex-shrink-0" />
            ) : (
              <Folder size={14} className="text-amber-400 flex-shrink-0" />
            )}
            <span className="text-[11px] font-mono text-gray-500">{node.code}</span>
          </button>
        </td>
        <td className={`px-2.5 py-2 align-top border border-gray-200 text-xs ${isLeaf ? 'text-black' : 'text-black font-bold'}`}>
          {node.description}
        </td>
        <td className="px-2.5 py-2 align-top border border-gray-200 text-xs text-gray-600">
          {node.unit ?? '—'}
        </td>
        <td className="px-2.5 py-2 align-top border border-gray-200 text-xs text-gray-600 text-right">
          {formatNumber(node.element_count)}
        </td>
        <td className="px-2.5 py-2 align-top border border-gray-200 text-xs font-semibold text-gray-800 text-right">
          {formatNumber(node.total)}
        </td>
      </tr>

      {expanded && hasChildren && (
        <>
          {node.children.map((child) => (
            <PartidaTableRow key={child.partida_id} node={child} depth={depth + 1} onSelectLeaf={onSelectLeaf} />
          ))}
        </>
      )}
    </>
  );
};

// ============================================================
// COMPONENTE PRINCIPAL — alterna entre árbol y pantalla de detalle
// ============================================================
const PartidasTree: React.FC<PartidasTreeProps> = ({ ifcFileId }) => {
  const [tree, setTree] = useState<PartidaNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<PartidaNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPartidasTree(ifcFileId)
      .then((data) => {
        if (!cancelled) setTree(data);
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

  const handleSelectLeaf = useCallback((node: PartidaNode) => {
    setSelectedNode(node);
  }, []);

  const handleBack = useCallback(() => {
    setSelectedNode(null);
  }, []);

  if (selectedNode) {
    return <PartidaDetailScreen ifcFileId={ifcFileId} node={selectedNode} onBack={handleBack} />;
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
      <div className="flex-shrink-0 flex items-center gap-1.5 mb-1.5 px-2 py-1 rounded bg-emerald-50 border border-emerald-200 w-fit">
        <CheckCircle2 size={12} className="text-emerald-600 flex-shrink-0" />
        <p className="text-[10px] font-semibold text-emerald-700">Metrados listos</p>
      </div>
      <div className="flex-1 min-h-0 overflow-auto rounded border border-gray-300">
        <table className="w-full text-[11px] border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-2.5 py-2 text-left font-semibold text-black border border-gray-300">Código</th>
              <th className="px-2.5 py-2 text-left font-semibold text-black border border-gray-300">Descripción</th>
              <th className="px-2.5 py-2 text-left font-semibold text-black border border-gray-300">Unidad</th>
              <th className="px-2.5 py-2 text-right font-semibold text-black border border-gray-300">Cant.</th>
              <th className="px-2.5 py-2 text-right font-semibold text-black border border-gray-300">Total</th>
            </tr>
          </thead>
          <tbody>
            {tree.map((node) => (
              <PartidaTableRow key={node.partida_id} node={node} depth={0} onSelectLeaf={handleSelectLeaf} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// React.memo: PartidasTree puede contener cientos de filas (árbol o
// tabla de detalle). Sin memo, cada pixel del arrastre para cambiar el
// ancho del panel (setPanelWidth en Visor3DTab, en cada mousemove)
// re-renderiza TODO el panel padre, incluida esta tabla completa —
// notoriamente lento. Con memo, solo se vuelve a renderizar cuando
// cambia su prop real (ifcFileId), no por re-renders del padre que no
// le afectan.
export default React.memo(PartidasTree);