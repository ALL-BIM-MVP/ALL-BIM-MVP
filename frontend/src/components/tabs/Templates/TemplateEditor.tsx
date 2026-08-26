// src/components/tabs/Templates/TemplateEditor.tsx
//
// Modal centrado "Columnas de la plantilla": a la izquierda las
// columnas EN USO (agrupadas por set, con ojito/basurero/reordenar
// según los permisos de abajo), a la derecha un catálogo persistente
// con tabs "Campos fijos" / "Propiedades IFC" para agregar. Reemplaza
// la versión anterior (panel lateral con un picker por cada set).
//
// REGLAS DE PERMISOS (no cambiaron con el rediseño visual):
//   - Plantilla por defecto (is_default, sin forceEditable): solo se
//     puede mostrar/ocultar columnas existentes y AGREGAR columnas de
//     vista — nunca borrar ni reordenar las originales. Las agregadas
//     en la sesión sí se pueden sacar. "Guardar" siempre crea una
//     plantilla nueva, nunca pisa el default.
//   - Modo "Nueva plantilla" (forceEditable=true): la plantilla activa
//     se usa como COPIA de partida, pero acá todo es editable (mover,
//     borrar, agregar), aunque el origen sea el default.
//   - Plantilla propia (isOwn): todo editable, "Guardar" actualiza
//     in-place (PUT).
//
// VISTA PREVIA EN VIVO: cada cambio (ojito/agregar/borrar/mover)
// dispara onChange(sets) — el padre (PartidasTree) usa esto para
// actualizar la tabla ya, sin esperar a "Guardar".

import React, { useEffect, useState } from 'react';
import { X, ChevronUp, ChevronDown, Eye, EyeOff, Trash2, Plus } from 'lucide-react';
import {
  createTemplate,
  deleteTemplate,
  getAvailableColumns,
  replaceTemplateColumns,
  toTemplateSetsInput,
  FALLBACK_BUILTIN_CATALOG,
  type AvailableColumns,
  type BuiltinField,
  type TemplateColumn,
  type TemplateFull,
  type TemplateSet,
} from '../../../services/templates.service';

interface EditableColumn extends TemplateColumn {
  _localId: string;
}
interface EditableSet extends Omit<TemplateSet, 'columns'> {
  columns: EditableColumn[];
  _localId: string;
}

let localIdSeq = 0;
const nextLocalId = () => `local-${++localIdSeq}`;

function toEditableSets(sets: TemplateSet[]): EditableSet[] {
  return sets.map((set) => ({
    ...set,
    _localId: nextLocalId(),
    columns: set.columns.map((col) => ({ ...col, _localId: nextLocalId() })),
  }));
}

// Mapea el applies_to_group del catálogo (viene del backend, en
// minúscula sin tilde: "identificacion","dimensiones","metrado",
// "totales") al nombre real de set que usan las plantillas
// (mayúscula con tilde, ver FALLBACK_DEFAULT_TEMPLATE). Si el usuario
// agrega una columna de una categoría que su plantilla todavía no
// tiene como set, se crea el set al vuelo.
const CATEGORY_TO_SET_NAME: Record<string, string> = {
  // OJO: sin tilde — "IDENTIFICACION" es el nombre REAL sembrado en la
  // BD (ver system-data.sql). Con tilde ("IDENTIFICACIÓN") nunca
  // matchea el set existente y crea uno nuevo aparte, que si se queda
  // vacío rompe el guardado (el backend exige mínimo 1 columna por set).
  identificacion: 'IDENTIFICACION',
  dimensiones: 'DIMENSIONES',
  metrado: 'METRADO',
  totales: 'METRADO', // sub_total/total conviven en METRADO en la plantilla base
};
const IFC_PROPERTY_SET_NAME = 'PROPIEDADES IFC';

interface TemplateEditorProps {
  source: TemplateFull | null;
  currentUserId: number;
  ifcFileId: string;
  onSaved: (template: TemplateFull) => void;
  onDeleted?: (templateId: number) => void;
  onClose: () => void;
  forceEditable?: boolean;
  onChange?: (sets: TemplateSet[]) => void;
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({
  source,
  currentUserId,
  ifcFileId,
  onSaved,
  onDeleted,
  onClose,
  forceEditable = false,
  onChange,
}) => {
  const isOwn = !forceEditable && !!source && !source.is_system && source.created_by === currentUserId;
  const isDefaultTemplate = !forceEditable && source?.is_default === true;

  const [name, setName] = useState(forceEditable ? '' : source?.name ?? '');
  // En modo "Nueva plantilla" el primer paso es SIEMPRE ponerle nombre
  // — recién ahí se muestra el editor de columnas. En cualquier otro
  // modo (ver/editar el default, editar una propia) se salta directo
  // a las columnas, porque el nombre ya existe de antes.
  const [step, setStep] = useState<'name' | 'columns'>(forceEditable ? 'name' : 'columns');
  const [sets, setSets] = useState<EditableSet[]>(toEditableSets(source?.sets ?? []));
  const [catalog, setCatalog] = useState<AvailableColumns | null>(null);
  const [catalogTab, setCatalogTab] = useState<'builtin' | 'ifc_property'>('builtin');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAvailableColumns(ifcFileId)
      .then(setCatalog)
      .catch((err: any) => setError(err.message || 'No se pudo cargar el catálogo de columnas.'));
  }, [ifcFileId]);

  useEffect(() => {
    onChange?.(sets);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sets]);

  function toggleColumnVisible(setLocalId: string, colLocalId: string) {
    setSets((prev) =>
      prev.map((s) =>
        s._localId !== setLocalId
          ? s
          : {
              ...s,
              columns: s.columns.map((c) =>
                c._localId === colLocalId ? { ...c, is_visible: !c.is_visible } : c
              ),
            }
      )
    );
  }

  function moveColumn(setLocalId: string, colLocalId: string, direction: -1 | 1) {
    setSets((prev) =>
      prev.map((s) => {
        if (s._localId !== setLocalId) return s;
        const idx = s.columns.findIndex((c) => c._localId === colLocalId);
        const swapWith = idx + direction;
        if (idx < 0 || swapWith < 0 || swapWith >= s.columns.length) return s;
        const columns = [...s.columns];
        [columns[idx], columns[swapWith]] = [columns[swapWith], columns[idx]];
        return { ...s, columns: columns.map((c, i) => ({ ...c, column_order: i + 1 })) };
      })
    );
  }

  function removeColumn(setLocalId: string, colLocalId: string) {
    setSets((prev) =>
      prev
        .map((s) =>
          s._localId !== setLocalId ? s : { ...s, columns: s.columns.filter((c) => c._localId !== colLocalId) }
        )
        // Si el set se quedó sin columnas, se saca del todo — un set
        // vacío no sirve para nada en la UI, y el backend lo rechaza
        // igual al guardar (mínimo 1 columna por set).
        .filter((s) => s.columns.length > 0)
    );
  }

  // Agrega una columna del catálogo al set correcto, creándolo si
  // hace falta (ver CATEGORY_TO_SET_NAME arriba).
  function addColumn(
    targetSetName: string,
    column: Pick<TemplateColumn, 'name' | 'source_type' | 'builtin_field' | 'property_set_name' | 'property_name'>
  ) {
    setSets((prev) => {
      const existing = prev.find((s) => s.name === targetSetName);
      const newCol: EditableColumn = {
        ...column,
        property_set_name: column.property_set_name ?? null,
        property_name: column.property_name ?? null,
        builtin_field: column.builtin_field ?? null,
        column_order: (existing?.columns.length ?? 0) + 1,
        is_visible: true,
        _localId: nextLocalId(),
      };
      if (existing) {
        return prev.map((s) =>
          s._localId === existing._localId ? { ...s, columns: [...s.columns, newCol] } : s
        );
      }
      // No existe ese set todavía en esta plantilla — se crea al final.
      const newSet: EditableSet = {
        _localId: nextLocalId(),
        name: targetSetName,
        sort_order: prev.length + 1,
        columns: [newCol],
      };
      return [...prev, newSet];
    });
  }

  function buildPayload() {
    return toTemplateSetsInput(sets);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Ponele un nombre a la plantilla.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isOwn && source) {
        const updated = await replaceTemplateColumns(source.template_id, buildPayload());
        onSaved(updated);
      } else {
        const created = await createTemplate({ name, sets: buildPayload() });
        onSaved(created);
      }
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar la plantilla.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!isOwn || !source) return;
    if (!window.confirm(`¿Borrar la plantilla "${source.name}"? No se puede deshacer.`)) return;
    setSaving(true);
    try {
      await deleteTemplate(source.template_id);
      onDeleted?.(source.template_id);
    } catch (err: any) {
      setError(err.message || 'No se pudo borrar la plantilla.');
    } finally {
      setSaving(false);
    }
  }

  const usedBuiltinFields = new Set(
    sets.flatMap((s) => s.columns.map((c) => c.builtin_field)).filter(Boolean) as BuiltinField[]
  );
  const usedIfcProperties = new Set(
    sets
      .flatMap((s) => s.columns)
      .filter((c) => c.source_type === 'ifc_property')
      .map((c) => `${c.property_set_name ?? ''}::${c.property_name ?? ''}`)
  );

  if (step === 'name') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />
        <div className="relative w-full max-w-sm bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
            <h2 className="text-base font-bold text-gray-900">Nueva plantilla</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
              <X size={18} />
            </button>
          </div>
          <div className="px-5 py-4 space-y-3">
            <p className="text-[11px] text-gray-500">
              Copia{source ? ` de "${source.name}"` : ''}, con todas sus columnas — le vas a poder
              mover, borrar y agregar lo que quieras después.
            </p>
            <div>
              <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Nombre de la plantilla
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && name.trim() && !saving) handleSave();
                }}
                placeholder="Ej: Plantilla de acero"
                className="mt-1 w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] outline-none"
              />
            </div>
            {error && <p className="text-[11px] text-red-600">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
            <button
              onClick={onClose}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded bg-[#0056b3] text-white font-semibold hover:bg-[#00458f] disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Crear plantilla'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[70vh] bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-bold text-gray-900">Columnas de la plantilla</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        {/* Avisos */}
        <div className="px-5 pt-3 flex-shrink-0 space-y-2">
          {forceEditable ? (
            <p className="text-[11px] bg-blue-50 border border-blue-100 text-[#0056b3] rounded px-2.5 py-1.5">
              Es una copia{source ? ` de "${source.name}"` : ''} — movés, borrás y agregás lo que
              quieras, no afecta a la original.
            </p>
          ) : isDefaultTemplate ? (
            <p className="text-[11px] bg-blue-50 border border-blue-100 text-[#0056b3] rounded px-2.5 py-1.5">
            </p>
          ) : (
            !isOwn &&
            source && (
              <p className="text-[11px] bg-blue-50 border border-blue-100 text-[#0056b3] rounded px-2.5 py-1.5">
                Esta plantilla es {source.is_system ? 'del sistema' : 'de otro usuario'} — se guarda
                como una copia nueva tuya, no se modifica la original.
              </p>
            )
          )}
          {error && (
            <p className="text-[11px] bg-red-50 border border-red-100 text-red-600 rounded px-2.5 py-1.5">
              {error}
            </p>
          )}
        </div>

        {/* Dos columnas: EN USO | catálogo */}
        <div className="flex-1 min-h-0 grid grid-cols-2 divide-x divide-gray-200 mt-3">
          {/* EN USO */}
          <div className="overflow-y-auto px-5 pb-4">
            <p className="text-[10px] font-bold text-[#0056b3] uppercase tracking-wide mb-2 sticky top-0 bg-white pt-1">
              En uso
            </p>
            <div className="space-y-3">
              {sets.map((set) => (
                <div key={set._localId}>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">
                    {set.name}
                  </p>
                  <ul className="space-y-0.5">
                    {set.columns.map((col, idx) => (
                      <li key={col._localId} className="flex items-center gap-1.5 py-1 group">
                        <span className="flex flex-col -space-y-1 flex-shrink-0">
                          <button
                            disabled={idx === 0}
                            onClick={() => moveColumn(set._localId, col._localId, -1)}
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <ChevronUp size={10} />
                          </button>
                          <button
                            disabled={idx === set.columns.length - 1}
                            onClick={() => moveColumn(set._localId, col._localId, 1)}
                            className="text-gray-300 hover:text-gray-600 disabled:opacity-20 disabled:cursor-not-allowed"
                          >
                            <ChevronDown size={10} />
                          </button>
                        </span>
                        <span className="flex-1 text-sm text-gray-800 truncate">{col.name}</span>
                        <button
                          onClick={() => toggleColumnVisible(set._localId, col._localId)}
                          className="text-gray-400 hover:text-[#0056b3] flex-shrink-0"
                          title={col.is_visible ? 'Ocultar' : 'Mostrar'}
                        >
                          {col.is_visible ? <Eye size={15} /> : <EyeOff size={15} />}
                        </button>
                        <button
                          onClick={() => removeColumn(set._localId, col._localId)}
                          className="text-gray-400 hover:text-red-500 flex-shrink-0"
                          title="Quitar"
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {sets.length === 0 && (
                <p className="text-xs text-gray-400">Todavía no hay columnas. Agregá desde la derecha.</p>
              )}
            </div>
          </div>

          {/* CATÁLOGO */}
          <div className="overflow-y-auto px-5 pb-4">
            <div className="sticky top-0 bg-white pt-1 pb-2 flex gap-1.5">
              <button
                onClick={() => setCatalogTab('builtin')}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  catalogTab === 'builtin'
                    ? 'bg-[#0056b3] text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Campos fijos
              </button>
              <button
                onClick={() => setCatalogTab('ifc_property')}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-colors ${
                  catalogTab === 'ifc_property'
                    ? 'bg-[#0056b3] text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                Propiedades IFC
              </button>
            </div>

            {!catalog ? (
              <p className="text-xs text-gray-400 py-4">Cargando catálogo...</p>
            ) : catalogTab === 'builtin' ? (
              <ul className="space-y-0.5">
                {(catalog.builtin && catalog.builtin.length > 0 ? catalog.builtin : FALLBACK_BUILTIN_CATALOG).map((entry) => {
                  const used = usedBuiltinFields.has(entry.builtin_field);
                  return (
                    <li key={entry.builtin_field}>
                      <button
                        disabled={used}
                        onClick={() =>
                          addColumn(CATEGORY_TO_SET_NAME[entry.applies_to_group] ?? 'OTROS', {
                            name: entry.label_default,
                            source_type: 'builtin',
                            builtin_field: entry.builtin_field,
                            property_set_name: null,
                            property_name: null,
                          })
                        }
                        className="w-full flex items-center justify-between gap-2 py-1 text-left disabled:cursor-not-allowed group"
                      >
                        <span
                          className={`flex items-center gap-1.5 text-sm ${
                            used ? 'text-gray-300' : 'text-[#0056b3] font-semibold group-hover:underline'
                          }`}
                        >
                          <Plus size={13} className={used ? 'text-gray-300' : 'text-[#0056b3]'} />
                          {entry.label_default}
                        </span>
                        <span className={`text-[10px] ${used ? 'text-gray-300' : 'text-gray-400'}`}>
                          {entry.applies_to_group}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="space-y-0.5">
                {catalog.ifc_properties.length === 0 && (
                  <p className="text-xs text-gray-400 py-4">Este archivo no trae propiedades adicionales.</p>
                )}
                {catalog.ifc_properties.map((entry) => {
                  const key = `${entry.property_set}::${entry.property_name}`;
                  const used = usedIfcProperties.has(key);
                  return (
                    <li key={key}>
                      <button
                        disabled={used}
                        onClick={() =>
                          addColumn(IFC_PROPERTY_SET_NAME, {
                            name: entry.property_name,
                            source_type: 'ifc_property',
                            builtin_field: null,
                            property_set_name: entry.property_set,
                            property_name: entry.property_name,
                          })
                        }
                        className="w-full flex items-center justify-between gap-2 py-1 text-left disabled:cursor-not-allowed group"
                      >
                        <span
                          className={`flex items-center gap-1.5 text-sm ${
                            used ? 'text-gray-300' : 'text-[#0056b3] font-semibold group-hover:underline'
                          }`}
                        >
                          <Plus size={13} className={used ? 'text-gray-300' : 'text-[#0056b3]'} />
                          {entry.property_name}
                        </span>
                        <span className={`text-[10px] ${used ? 'text-gray-300' : 'text-gray-400'}`}>
                          {entry.property_set || 'sin set'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-200 flex-shrink-0">
          {isDefaultTemplate ? (
            // En el default no hay nada que guardar acá — solo se
            // puede ver/ocultar/agregar para vista temporal. Para
            // guardar de verdad hay que usar "+ Nueva" (forceEditable),
            // que sí muestra este footer completo.
            <p className="text-[11px] text-gray-400">
              
            </p>
          ) : (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nombre de la plantilla"
                className="text-sm px-2.5 py-1.5 border border-gray-300 rounded flex-1 min-w-0 focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] outline-none"
              />
              {isOwn && (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="text-[11px] font-semibold text-red-500 hover:underline disabled:opacity-50 whitespace-nowrap"
                >
                  Borrar plantilla
                </button>
              )}
            </div>
          )}
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
            >
              {isDefaultTemplate ? 'Cerrar' : 'Cancelar'}
            </button>
            {!isDefaultTemplate && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-xs px-3 py-1.5 rounded bg-[#0056b3] text-white font-semibold hover:bg-[#00458f] disabled:opacity-50"
              >
                {saving ? 'Guardando…' : forceEditable ? 'Guardar' : isOwn ? 'Guardar plantilla' : 'Guardar como nueva'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditor;