// src/components/tabs/Templates/MetradosTable.tsx


import React, { useRef, useState } from 'react';
import type { PartidaDetail, PartidaGroup } from '../../../services/ifcfiles.service';
import {
  propertyKey,
  type TemplateColumn,
  type TemplateFull,
  type TemplateSet,
} from '../../../services/templates.service';

interface MetradosTableProps {
  template: TemplateFull;
  detail: PartidaDetail;
  code: string;
  description: string;
  unit: string | null;
 
  onReorderColumn?: (setIndex: number, fromColIndex: number, toColIndex: number) => void;

  onToggleGroupSelect?: (group: PartidaGroup, index: number) => void;
  selectedGroupIndex?: number | null;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('es-PE', { maximumFractionDigits: 4 });
}

const NUMERIC_BUILTIN_FIELDS = new Set([
  'length', 'width', 'height', 'run_length', 'quantity', 'area', 'volume',
  'weight', 'sub_total', 'total',
]);


const ORIGEN_METRADO_LABEL: Record<string, string> = {
  tipado: 'Dimensión tipada del elemento IFC',
  geometrico: 'Calculado a partir de la geometría',
  texto: 'Tomado tal cual de una propiedad de texto',
  acero_diametro: 'Diámetro de acero (armadura)',
  acero_seccion: 'Sección de acero (armadura)',
};

function OrigenMetradoBadge({ origen }: { origen: string | null | undefined }) {
  if (!origen) return null;
  const label = ORIGEN_METRADO_LABEL[origen] ?? origen;
  return (
    <span
      title={`Origen del metrado: ${label}`}
      className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-amber-400 align-middle cursor-help"
    />
  );
}

function cellValue(
  column: TemplateColumn,
  group: PartidaGroup,
  ctx: { code: string; description: string; unit: string | null; total: number }
): string {
  if (column.source_type === 'builtin' && column.builtin_field) {
    if (column.builtin_field === 'code') return ctx.code;
    if (column.builtin_field === 'description') return ctx.description;
    if (column.builtin_field === 'unit') return ctx.unit ?? '—';
    if (column.builtin_field === 'total') return formatNumber(ctx.total);
    const raw = (group as unknown as Record<string, unknown>)[column.builtin_field];
    if (raw === undefined || raw === null) return '—';
    if (typeof raw === 'number') return formatNumber(raw);
    return String(raw);
  }
  const key = propertyKey(column.property_set_name, column.property_name);
  return group.properties?.[key] ?? '—';
}


interface FlatColumn {
  col: TemplateColumn;
  setIndex: number;
  colIndexInSet: number;
}

function buildFlatColumns(sets: TemplateSet[]): { orderedSets: TemplateSet[]; flat: FlatColumn[] } {
  const orderedSets = [...sets].sort((a, b) => a.sort_order - b.sort_order);
  const flat: FlatColumn[] = [];
  orderedSets.forEach((set, setIndex) => {
    const visible = [...set.columns].filter((c) => c.is_visible).sort((a, b) => a.column_order - b.column_order);
    visible.forEach((col, colIndexInSet) => {
      flat.push({ col, setIndex, colIndexInSet });
    });
  });
  return { orderedSets, flat };
}

const MetradosTable: React.FC<MetradosTableProps> = ({
  template,
  detail,
  code,
  description,
  unit,
  onReorderColumn,
  onToggleGroupSelect,
  selectedGroupIndex = null,
}) => {
  const { orderedSets, flat } = buildFlatColumns(template.sets);
  const draggingRef = useRef<{ setIndex: number; colIndexInSet: number } | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  if (flat.length === 0) {
    return (
      <div className="flex-1 min-h-0 py-10 text-center text-gray-400">
        <p className="text-sm">Esta plantilla no tiene columnas visibles.</p>
      </div>
    );
  }

  const colKey = (fc: FlatColumn) => fc.col.template_column_id ?? `${fc.setIndex}-${fc.col.source_type}-${fc.col.name}`;

  const handleDragStart = (fc: FlatColumn) => {
    if (!onReorderColumn) return;
    draggingRef.current = { setIndex: fc.setIndex, colIndexInSet: fc.colIndexInSet };
  };

  const handleDragOver = (fc: FlatColumn, e: React.DragEvent) => {
    if (!onReorderColumn || !draggingRef.current) return;
    if (draggingRef.current.setIndex !== fc.setIndex) return; // no se cruza de grupo
    e.preventDefault(); // necesario para permitir el drop
    setDragOverKey(String(colKey(fc)));
  };

  const handleDrop = (fc: FlatColumn, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
    const from = draggingRef.current;
    draggingRef.current = null;
    if (!onReorderColumn || !from) return;
    if (from.setIndex !== fc.setIndex) return; // no se cruza de grupo
    if (from.colIndexInSet === fc.colIndexInSet) return;
    onReorderColumn(from.setIndex, from.colIndexInSet, fc.colIndexInSet);
  };

  const handleDragEnd = () => {
    draggingRef.current = null;
    setDragOverKey(null);
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto rounded border border-gray-300">
      <table className="w-full text-[10px] border-separate border-spacing-0 min-w-[820px]">
        <thead>
          <tr className="bg-gray-100">
            {orderedSets.map((set) => {
              const visibleInSet = set.columns.filter((c) => c.is_visible);
              if (visibleInSet.length === 0) return null;
              return (
                <th
                  key={set.template_set_id ?? set.name}
                  colSpan={visibleInSet.length}
                  className="sticky top-0 z-20 h-[26px] px-2 py-1 text-left font-bold text-black bg-gray-100 border-r border-b border-gray-300"
                >
                  {set.name}
                </th>
              );
            })}
          </tr>
          <tr className="bg-gray-50">
            {flat.map((fc) => {
              const key = colKey(fc);
              const isNumeric =
                fc.col.source_type === 'builtin' && NUMERIC_BUILTIN_FIELDS.has(fc.col.builtin_field ?? '');
              const isDragOver = dragOverKey === String(key);
              return (
                <th
                  key={key}
                  draggable={!!onReorderColumn}
                  onDragStart={() => handleDragStart(fc)}
                  onDragOver={(e) => handleDragOver(fc, e)}
                  onDrop={(e) => handleDrop(fc, e)}
                  onDragEnd={handleDragEnd}
                  title={onReorderColumn ? 'Arrastrá para reordenar dentro de este grupo' : undefined}
                  className={`sticky top-[26px] z-10 bg-gray-50 px-2 py-1.5 font-semibold text-black border-r border-b border-gray-300 select-none ${
                    isNumeric ? 'text-right' : 'text-left'
                  } ${
                    onReorderColumn
                      ? 'cursor-grab active:cursor-grabbing hover:bg-blue-100 hover:border-[#0056b3] transition-colors'
                      : ''
                  } ${
                    isDragOver ? 'bg-blue-100 outline outline-2 outline-[#0056b3] outline-offset-[-2px]' : ''
                  }`}
                >
                  {fc.col.name}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {detail.groups.map((group, i) => {
            const isSelected = selectedGroupIndex === i;
            return (
            <tr
              key={i}
              id={`metrado-row-${i}`}
              onClick={() => onToggleGroupSelect?.(group, i)}
              title={
                onToggleGroupSelect
                  ? isSelected
                    ? 'Click: deseleccionar'
                    : 'Click: seleccionar este grupo en el visor 3D'
                  : undefined
              }
              className={`${
                isSelected ? 'bg-blue-100' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              } ${
                onToggleGroupSelect ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''
              }`}
            >
              {flat.map((fc) => (
                <td
                  key={colKey(fc)}
                  className={`px-2 py-1.5 border-r border-b border-gray-200 text-gray-600 ${
                    fc.col.source_type === 'builtin' && NUMERIC_BUILTIN_FIELDS.has(fc.col.builtin_field ?? '')
                      ? 'text-right'
                      : 'text-left'
                  } ${fc.col.builtin_field === 'sub_total' ? 'font-semibold text-gray-800' : ''} ${
                    fc.col.builtin_field === 'total' ? 'font-bold text-black' : ''
                  }`}
                >
                  {cellValue(fc.col, group, { code, description, unit, total: detail.total })}
                  {fc.col.builtin_field === 'sub_total' && (
                    <OrigenMetradoBadge origen={group.origen_metrado} />
                  )}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MetradosTable;