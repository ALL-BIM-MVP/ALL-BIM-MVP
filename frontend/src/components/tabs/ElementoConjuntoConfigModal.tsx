// src/components/tabs/ElementoConjuntoConfigModal.tsx
//
// Configura qué campos componen la clave de "elemento conjunto" que
// usa la tabla "Verificación de elementos" de Inicio (Consolidación
// punto 1.a) — antes eran 4 campos fijos (Archivo/GUID/Tag/Código de
// partida), ahora el usuario elige, por proyecto, cuáles builtin y/o
// cuáles propiedades del IFC forman la clave (mínimo 2).
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, AlertTriangle, Eye, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import {
  getAvailableElementoConjuntoFields,
  getElementoConjuntoConfig,
  setElementoConjuntoConfig,
  AvailableElementoConjuntoFields,
  ElementoConjuntoFieldInput,
} from '../../services/ifcfiles.service';

interface ElementoConjuntoConfigModalProps {
  projectId: number;
  onClose: () => void;
  onSaved?: () => void;
  // Igual criterio que ClassificationConfigModal — sin permiso
  // 'configure' se puede ABRIR para ver cómo está armada la clave hoy,
  // pero todo queda deshabilitado y no hay botón de Guardar.
  readOnly?: boolean;
}

// Identidad única de un campo — para comparar selección sin importar
// el orden, y para el key de React en las listas.
function fieldKey(f: ElementoConjuntoFieldInput): string {
  return f.field_type === 'builtin' ? `builtin::${f.builtin_field}` : `property::${f.property_set ?? ''}::${f.property_name}`;
}

function fieldLabel(f: ElementoConjuntoFieldInput, builtinLabels: Record<string, string>): string {
  if (f.field_type === 'builtin') return builtinLabels[f.builtin_field] ?? f.builtin_field;
  return f.property_set ? `${f.property_set}::${f.property_name}` : f.property_name;
}

const ElementoConjuntoConfigModal: React.FC<ElementoConjuntoConfigModalProps> = ({
  projectId,
  onClose,
  onSaved,
  readOnly = false,
}) => {
  const [available, setAvailable] = useState<AvailableElementoConjuntoFields | null>(null);
  const [selected, setSelected] = useState<ElementoConjuntoFieldInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getAvailableElementoConjuntoFields(projectId),
      getElementoConjuntoConfig(projectId),
    ])
      .then(([fields, config]) => {
        if (cancelled) return;
        setAvailable(fields);
        setSelected(
          config.fields
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((f) =>
              f.field_type === 'builtin'
                ? { field_type: 'builtin', builtin_field: f.builtin_field! }
                : { field_type: 'property', property_set: f.property_set ?? undefined, property_name: f.property_name! }
            )
        );
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Error al cargar la configuración.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const builtinLabels = useMemo(() => {
    const map: Record<string, string> = {};
    available?.builtin.forEach((b) => { map[b.builtin_field] = b.label; });
    return map;
  }, [available]);

  const selectedKeys = useMemo(() => new Set(selected.map(fieldKey)), [selected]);

  const toggleField = (f: ElementoConjuntoFieldInput) => {
    if (readOnly) return;
    setError(null);
    const key = fieldKey(f);
    setSelected((prev) =>
      prev.some((s) => fieldKey(s) === key) ? prev.filter((s) => fieldKey(s) !== key) : [...prev, f]
    );
  };

  const moveField = (index: number, direction: -1 | 1) => {
    if (readOnly) return;
    setSelected((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.length < 2) {
      setError('La clave necesita al menos 2 campos.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setElementoConjuntoConfig(projectId, selected);
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return createPortal(
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10400]">
        <div className="bg-white rounded-lg w-[520px] shadow-2xl border border-gray-200 p-8">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-[#0056b3]" />
            <p className="text-sm text-slate-500">Cargando configuración...</p>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  if (!available) {
    return createPortal(
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10400]">
        <div className="bg-white rounded-lg w-[520px] shadow-2xl border border-gray-200 p-8">
          <div className="flex flex-col items-center gap-3">
            <AlertTriangle size={28} className="text-red-500" />
            <p className="text-sm text-red-600">{error || 'No se pudo cargar la configuración.'}</p>
            <button
              onClick={onClose}
              className="mt-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10400] p-6">
      <div className="bg-white rounded-lg w-[640px] max-h-[90vh] shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">Clave de "elemento conjunto"</h3>
            {readOnly && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold">
                <Eye size={11} />
                Solo lectura
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
          

          {/* Orden actual */}
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-2">
              Clave actual ({selected.length} campo{selected.length !== 1 ? 's' : ''})
            </h4>
            {selected.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Todavía no elegiste ningún campo.</p>
            ) : (
              <ul className="space-y-1.5">
                {selected.map((f, idx) => (
                  <li
                    key={fieldKey(f)}
                    className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-md px-2.5 py-1.5"
                  >
                    <GripVertical size={13} className="text-slate-300 flex-shrink-0" />
                    <span className="text-[10px] font-mono text-slate-400 w-4 flex-shrink-0">{idx + 1}</span>
                    <span className="flex-1 text-xs text-slate-700 font-medium truncate">
                      {fieldLabel(f, builtinLabels)}
                    </span>
                    {!readOnly && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => moveField(idx, -1)}
                          disabled={idx === 0}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Subir"
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveField(idx, 1)}
                          disabled={idx === selected.length - 1}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Bajar"
                        >
                          <ChevronDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleField(f)}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Quitar"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-gray-200" />

          {/* Campos fijos */}
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-2">Campos fijos</h4>
            <div className="space-y-1.5">
              {available.builtin.map((b) => {
                const f: ElementoConjuntoFieldInput = { field_type: 'builtin', builtin_field: b.builtin_field };
                const isChecked = selectedKeys.has(fieldKey(f));
                return (
                  <label
                    key={b.builtin_field}
                    className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md ${readOnly ? '' : 'cursor-pointer hover:bg-gray-50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleField(f)}
                      disabled={readOnly}
                      className="rounded border-gray-300 text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
                    />
                    <span className="text-sm text-slate-700">{b.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Propiedades del IFC */}
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-2">Propiedades del IFC</h4>
            {available.ifc_properties.length === 0 ? (
              <p className="text-xs text-slate-400 italic">
                No se encontró ninguna propiedad en los archivos IFC procesados de este proyecto todavía.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {available.ifc_properties.map((p) => {
                  const f: ElementoConjuntoFieldInput = {
                    field_type: 'property',
                    property_set: p.property_set,
                    property_name: p.property_name,
                  };
                  const isChecked = selectedKeys.has(fieldKey(f));
                  return (
                    <label
                      key={fieldKey(f)}
                      className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md ${readOnly ? '' : 'cursor-pointer hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleField(f)}
                        disabled={readOnly}
                        className="rounded border-gray-300 text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
                      />
                      <span className="text-sm text-slate-700 truncate">
                        {p.property_set}::{p.property_name}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/70 flex justify-end gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors"
          >
            {readOnly ? 'Cerrar' : 'Cancelar'}
          </button>
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving || selected.length < 2}
              className={`px-5 py-1.5 rounded text-sm font-semibold transition-colors flex items-center gap-2 ${
                saving || selected.length < 2
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-[#0056b3] text-white hover:bg-[#004494]'
              }`}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ElementoConjuntoConfigModal;
