// src/components/tabs/PartidasTree.tsx
//
// Árbol de partidas (GET /ifc-files/:id/partidas) con expansión de
// carpetas y, al abrir una partida hoja (unit !== null), el detalle
// agrupado (POST /ifc-files/:id/partidas/:partidaId/elements).

import React, { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, Loader2, AlertTriangle, FolderOpen, FileBarChart2 } from 'lucide-react';
import {
  PartidaNode,
  PartidaDetail,
  PartidaGroup,
  getPartidasTree,
  getPartidaElements,
  metradoFieldForUnit,
} from '../../services/ifcfiles.service';

interface PartidasTreeProps {
  ifcFileId: string;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('es-PE', { maximumFractionDigits: 3 });
}

// ---------- Tabla de detalle (grupos) de una partida hoja ----------
const GroupsTable: React.FC<{ detail: PartidaDetail }> = ({ detail }) => {
  const metradoField = metradoFieldForUnit(detail.unit);
  const metradoLabel: Record<string, string> = {
    run_length: 'Longitud',
    area: 'Área',
    volume: 'Vol.',
    weight: 'Kg.',
    quantity: 'Cant.',
  };

  return (
    <div className="ml-6 mt-1 mb-2 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-[11px] border-collapse min-w-[560px]">
        <thead>
          <tr className="bg-slate-50">
            <th className="px-2.5 py-1.5 text-left font-semibold text-slate-500 border-b border-slate-200">Nivel</th>
            <th className="px-2.5 py-1.5 text-left font-semibold text-slate-500 border-b border-slate-200">Espacio</th>
            <th className="px-2.5 py-1.5 text-left font-semibold text-slate-500 border-b border-slate-200">Tag</th>
            <th className="px-2.5 py-1.5 text-right font-semibold text-slate-500 border-b border-slate-200">Cant.</th>
            <th className="px-2.5 py-1.5 text-right font-semibold text-slate-500 border-b border-slate-200">
              {metradoLabel[metradoField]}
            </th>
            <th className="px-2.5 py-1.5 text-right font-semibold text-slate-500 border-b border-slate-200">Sub Total</th>
          </tr>
        </thead>
        <tbody>
          {detail.groups.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-2.5 py-3 text-center text-slate-400">
                Sin elementos en esta partida.
              </td>
            </tr>
          ) : (
            detail.groups.map((group: PartidaGroup, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                <td className="px-2.5 py-1.5 border-b border-slate-100 text-slate-600">{group.level_name}</td>
                <td className="px-2.5 py-1.5 border-b border-slate-100 text-slate-600">{group.space_name}</td>
                <td className="px-2.5 py-1.5 border-b border-slate-100 text-slate-600">{group.tag}</td>
                <td className="px-2.5 py-1.5 border-b border-slate-100 text-slate-600 text-right">{group.element_count}</td>
                <td className="px-2.5 py-1.5 border-b border-slate-100 text-slate-600 text-right">
                  {formatNumber(group[metradoField] as number)}
                </td>
                <td className="px-2.5 py-1.5 border-b border-slate-100 text-slate-700 font-semibold text-right">
                  {formatNumber(group.sub_total)}
                </td>
              </tr>
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5} className="px-2.5 py-1.5 text-right font-semibold text-slate-500 border-t border-slate-200">
              Total partida
            </td>
            <td className="px-2.5 py-1.5 text-right font-bold text-[#0056b3] border-t border-slate-200">
              {formatNumber(detail.total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

// ---------- Una fila de la tabla (carpeta o partida hoja), recursiva ----------
const PartidaTableRow: React.FC<{ node: PartidaNode; depth: number; ifcFileId: string }> = ({
  node,
  depth,
  ifcFileId,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<PartidaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const isLeaf = node.unit !== null;
  const hasChildren = node.children && node.children.length > 0;
  const isExpandable = isLeaf || hasChildren;

  const handleToggle = async () => {
    if (!isExpandable) return;
    setExpanded((prev) => !prev);
  };

  useEffect(() => {
    if (!expanded || !isLeaf || detail || detailLoading || detailError) return;

    let cancelled = false;
    const loadDetail = async () => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const d = await getPartidaElements(ifcFileId, node.partida_id);
        if (!cancelled) setDetail(d);
      } catch (err: any) {
        if (!cancelled) setDetailError(err.message || 'Error al cargar el detalle de la partida.');
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    };

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [expanded, isLeaf, detail, detailLoading, detailError, ifcFileId, node.partida_id]);

  return (
    <>
      <tr className={isLeaf ? 'bg-white hover:bg-slate-50' : 'bg-slate-50/40 hover:bg-slate-100/70'}>
        <td className="px-2.5 py-2 align-top border-b border-slate-200" style={{ paddingLeft: 12 + depth * 18 }}>
          <button
            onClick={handleToggle}
            className={`inline-flex items-center gap-2 text-left ${isExpandable ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span className="w-3.5 flex-shrink-0 text-slate-400">
              {isExpandable ? (
                expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
              ) : null}
            </span>
            {isLeaf ? (
              <FileBarChart2 size={13} className="text-[#0056b3] flex-shrink-0" />
            ) : (
              <FolderOpen size={13} className="text-slate-400 flex-shrink-0" />
            )}
            <span className="text-[11px] font-mono text-slate-500">{node.code}</span>
          </button>
        </td>
        <td className="px-2.5 py-2 align-top border-b border-slate-200 text-xs text-slate-700">
          {node.description}
        </td>
        <td className="px-2.5 py-2 align-top border-b border-slate-200 text-xs text-slate-600">
          {node.unit ?? '—'}
        </td>
        <td className="px-2.5 py-2 align-top border-b border-slate-200 text-xs text-slate-600 text-right">
          {formatNumber(node.element_count)}
        </td>
        <td className="px-2.5 py-2 align-top border-b border-slate-200 text-xs font-semibold text-slate-800 text-right">
          {formatNumber(node.total)}
        </td>
      </tr>

      {expanded && hasChildren && (
        <>
          {node.children.map((child) => (
            <PartidaTableRow key={child.partida_id} node={child} depth={depth + 1} ifcFileId={ifcFileId} />
          ))}
        </>
      )}

      {expanded && isLeaf && (
        <tr>
          <td colSpan={5} className="px-0 py-1 bg-white">
            {detailLoading ? (
              <div className="ml-6 py-3 flex items-center gap-2 text-xs text-slate-400">
                <Loader2 size={13} className="animate-spin" /> Cargando detalle...
              </div>
            ) : detailError ? (
              <div className="ml-6 py-2 flex items-center gap-2 text-xs text-red-500">
                <AlertTriangle size={13} /> {detailError}
              </div>
            ) : detail ? (
              <GroupsTable detail={detail} />
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
};

// ---------- Componente principal: carga el árbol y lo renderiza como tabla por defecto ----------
const PartidasTree: React.FC<PartidasTreeProps> = ({ ifcFileId }) => {
  const [tree, setTree] = useState<PartidaNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) {
    return (
      <div className="py-10 text-center text-slate-400">
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
      <div className="py-10 text-center text-slate-400">
        <p className="text-sm">No se encontraron partidas para este archivo.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-[11px] border-collapse min-w-[600px]">
        <thead>
          <tr className="bg-slate-50">
            <th className="px-2.5 py-2 text-left font-semibold text-slate-500 border-b border-slate-200">Código</th>
            <th className="px-2.5 py-2 text-left font-semibold text-slate-500 border-b border-slate-200">Descripción</th>
            <th className="px-2.5 py-2 text-left font-semibold text-slate-500 border-b border-slate-200">Unidad</th>
            <th className="px-2.5 py-2 text-right font-semibold text-slate-500 border-b border-slate-200">Cant.</th>
            <th className="px-2.5 py-2 text-right font-semibold text-slate-500 border-b border-slate-200">Total</th>
          </tr>
        </thead>
        <tbody>
          {tree.map((node) => (
            <PartidaTableRow key={node.partida_id} node={node} depth={0} ifcFileId={ifcFileId} />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default PartidasTree;