// src/components/tabs/ClassificationConfigModal.tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Lock, Unlock, AlertTriangle, Eye } from 'lucide-react';
import {
  getClassificationConfig,
  setClassificationConfig,
  ClassificationConfig,
  ClassificationConfigInput,
} from '../../services/ifcfiles.service';

interface ClassificationConfigModalProps {
  projectId: number;
  onClose: () => void;
  onSaved?: () => void;
 
  readOnly?: boolean;
}

const ClassificationConfigModal: React.FC<ClassificationConfigModalProps> = ({
  projectId,
  onClose,
  onSaved,
  readOnly = false,
}) => {
  const [config, setConfig] = useState<ClassificationConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar config actual al abrir
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getClassificationConfig(projectId)
      .then((data) => {
        if (!cancelled) setConfig(data);
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

  // Guardar config
  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    try {
      const input: ClassificationConfigInput = {
        mode: config.mode,
        mode_locked: config.mode_locked,
        property_prefix: config.property_prefix ?? undefined, // Convertir null a undefined
        property_prefix_locked: config.property_prefix_locked,
      };

      // Si mode es manual, incluir los campos de propiedades
      if (config.mode === 'manual') {
        const field = config.fields[0];
        if (field) {
          input.code_property_set = field.code_property_set ?? undefined;
          input.code_property_name = field.code_property_name;
          input.description_property_set = field.description_property_set ?? undefined;
          input.description_property_name = field.description_property_name ?? undefined;
          input.unit_property_set = field.unit_property_set ?? undefined;
          input.unit_property_name = field.unit_property_name ?? undefined;
        }
      }

      await setClassificationConfig(projectId, input);
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error al guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  // Actualizar un campo del config
  const updateConfig = (updates: Partial<ClassificationConfig>) => {
    setConfig((prev) => (prev ? { ...prev, ...updates } : prev));
  };

  // Actualizar un campo de la clasificación manual
  const updateField = (fieldIndex: number, updates: Partial<ClassificationConfig['fields'][0]>) => {
    setConfig((prev) => {
      if (!prev) return prev;
      const fields = [...prev.fields];
      if (fields[fieldIndex]) {
        fields[fieldIndex] = { ...fields[fieldIndex], ...updates };
      } else {
        fields[fieldIndex] = {
          slot: fieldIndex + 1,
          code_property_set: null,
          code_property_name: '',
          description_property_set: null,
          description_property_name: null,
          unit_property_set: null,
          unit_property_name: null,
          ...updates,
        };
      }
      return { ...prev, fields };
    });
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

  if (!config) {
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

  // Asegurar que existe al menos un field
  const field = config.fields[0] || {
    slot: 1,
    code_property_set: null,
    code_property_name: '',
    description_property_set: null,
    description_property_name: null,
    unit_property_set: null,
    unit_property_name: null,
  };

  return createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10400] p-6">
      <div className="bg-white rounded-lg w-[640px] max-h-[90vh] shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-800">Configuración de clasificación</h3>
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
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-6">
          {/* Sección 1: Cómo agrupar */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-800">Cómo agrupar los elementos</h4>

            <div className="space-y-2">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  checked={config.mode === 'norma'}
                  onChange={() => updateConfig({ mode: 'norma' })}
                  disabled={readOnly || config.mode_locked}
                  className="mt-0.5 text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
                />
                <div>
                  <p className="text-sm font-medium text-slate-700">Norma técnica (por defecto)</p>
                  <p className="text-xs text-slate-500">Clasifica contra la norma cargada en el sistema.</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  checked={config.mode === 'manual'}
                  onChange={() => updateConfig({ mode: 'manual' })}
                  disabled={readOnly || config.mode_locked}
                  className="mt-0.5 text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
                />
                <div>
                  <p className="text-sm font-medium text-slate-700">Propiedades del IFC (manual)</p>
                  <p className="text-xs text-slate-500">
                    Usa propiedades escritas a mano en cada elemento del IFC.
                  </p>
                </div>
              </label>
            </div>

            {/* Campos de propiedades manuales */}
            {config.mode === 'manual' && (
              <div className="ml-6 space-y-3 border-l-2 border-blue-200 pl-4">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Propiedad de código <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={field.code_property_set || ''}
                      onChange={(e) => updateField(0, { code_property_set: e.target.value || null })}
                      disabled={readOnly}
                      placeholder="Grupo (opcional)"
                      className="w-1/3 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                    />
                    <input
                      type="text"
                      value={field.code_property_name}
                      onChange={(e) => updateField(0, { code_property_name: e.target.value })}
                      disabled={readOnly}
                      placeholder="Nombre de la propiedad"
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Propiedad de descripción
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={field.description_property_set || ''}
                      onChange={(e) => updateField(0, { description_property_set: e.target.value || null })}
                      disabled={readOnly}
                      placeholder="Grupo (opcional)"
                      className="w-1/3 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                    />
                    <input
                      type="text"
                      value={field.description_property_name || ''}
                      onChange={(e) => updateField(0, { description_property_name: e.target.value || null })}
                      disabled={readOnly}
                      placeholder="Nombre de la propiedad"
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                    Propiedad de unidad
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={field.unit_property_set || ''}
                      onChange={(e) => updateField(0, { unit_property_set: e.target.value || null })}
                      disabled={readOnly}
                      placeholder="Grupo (opcional)"
                      className="w-1/3 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                    />
                    <input
                      type="text"
                      value={field.unit_property_name || ''}
                      onChange={(e) => updateField(0, { unit_property_name: e.target.value || null })}
                      disabled={readOnly}
                      placeholder="Nombre de la propiedad"
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Candado de modo */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.mode_locked}
                onChange={(e) => updateConfig({ mode_locked: e.target.checked })}
                disabled={readOnly}
                className="rounded border-gray-300 text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
              />
              <span className="text-xs text-slate-600 flex items-center gap-1">
                {config.mode_locked ? <Lock size={12} /> : <Unlock size={12} />}
                Bloquear cómo se agrupa
              </span>
            </label>
          </div>

          {/* Separador */}
          <div className="border-t border-gray-200" />

          {/* Sección 2: Prefijo de propiedades */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-800">Qué propiedades capturar</h4>

            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Prefijo de propiedades (opcional)
              </label>
              <input
                type="text"
                value={config.property_prefix || ''}
                onChange={(e) => updateConfig({ property_prefix: e.target.value || null })}
                disabled={readOnly}
                placeholder="p.ej. CSRT-"
                className="w-full px-3 py-2 border border-gray-200 rounded text-sm outline-none focus:ring-2 focus:ring-[#0056b3]"
              />
              <p className="text-xs text-slate-500 mt-1">
                Identifica qué propiedades escribió a mano el usuario, vs. las que exporta Revit solo.
                Aplica sin importar cómo agrupás arriba.
              </p>
            </div>

            {/* Candado de prefijo */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.property_prefix_locked}
                onChange={(e) => updateConfig({ property_prefix_locked: e.target.checked })}
                disabled={readOnly}
                className="rounded border-gray-300 text-[#0056b3] focus:ring-[#0056b3] disabled:opacity-50"
              />
              <span className="text-xs text-slate-600 flex items-center gap-1">
                {config.property_prefix_locked ? <Lock size={12} /> : <Unlock size={12} />}
                Bloquear el prefijo
              </span>
            </label>
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
            disabled={saving || (config.mode === 'manual' && !field.code_property_name)}
            className={`px-5 py-1.5 rounded text-sm font-semibold transition-colors flex items-center gap-2 ${
              saving || (config.mode === 'manual' && !field.code_property_name)
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

export default ClassificationConfigModal;
