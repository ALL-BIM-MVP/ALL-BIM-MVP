import React, { useState } from 'react';
import { Field } from './FormField';
import { trimNumeric } from '../../../utils/numberFormat';

export interface EditFieldDef {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: Array<[string, string]>; // [valor, etiqueta] — solo para "select"
  nullable?: boolean; // vacío = null (el backend lo acepta); si no, es obligatorio
  span?: 1 | 2 | 3;
  hint?: string;
}

interface EditFormProps {
  title: string;
  fields: EditFieldDef[];
  initial: Record<string, string | number | null | undefined>;
  // Recibe SOLO lo que cambió (PATCH parcial). Si lanza, el mensaje se muestra y el formulario queda abierto.
  onSave: (patch: Record<string, string | number | null>) => Promise<void>;
  onCancel: () => void;
}

const SPAN: Record<number, string> = { 1: '', 2: '@sm:col-span-2', 3: '@sm:col-span-3' };

/** Formulario de edición parcial: muestra los campos con su valor actual y manda solo los que cambiaron. */
const EditForm: React.FC<EditFormProps> = ({ title, fields, initial, onSave, onCancel }) => {
  const asText = (f: EditFieldDef, v: string | number | null | undefined) => (v === null || v === undefined ? '' : f.type === 'number' ? trimNumeric(v) : String(v));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, asText(f, initial[f.key])])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const patch: Record<string, string | number | null> = {};
    for (const f of fields) {
      const now = values[f.key].trim();
      if (now === asText(f, initial[f.key]).trim()) continue;
      if (now === '') {
        if (!f.nullable) { setError(`"${f.label}" no puede quedar vacío.`); return; }
        patch[f.key] = null;
      } else if (f.type === 'number') {
        const n = parseFloat(now);
        if (Number.isNaN(n)) { setError(`"${f.label}" tiene que ser un número.`); return; }
        patch[f.key] = n;
      } else {
        patch[f.key] = now;
      }
    }
    if (Object.keys(patch).length === 0) { onCancel(); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron guardar los cambios.');
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-sm font-semibold text-gray-800 mb-3">{title}</p>
      <div className="grid grid-cols-1 @sm:grid-cols-3 gap-3">
        {fields.map((f) => f.type === 'select' ? (
          <label key={f.key} className={`block ${SPAN[f.span ?? 1]}`}>
            <span className="text-[11px] text-gray-500 font-medium">{f.label}</span>
            <select
              value={values[f.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="w-full mt-1 px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3]"
            >
              {f.options?.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        ) : (
          <Field
            key={f.key}
            label={f.label}
            required={!f.nullable}
            type={f.type ?? 'text'}
            value={values[f.key]}
            onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
            className={SPAN[f.span ?? 1]}
            hint={f.hint}
          />
        ))}
      </div>
      {error && <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
      <div className="flex justify-end gap-2 mt-4">
        <button onClick={onCancel} disabled={saving} className="border border-gray-200 rounded-lg px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Cancelar</button>
        <button onClick={submit} disabled={saving} className="bg-[#0056b3] text-white rounded-lg px-5 py-1.5 text-sm font-semibold hover:bg-[#004494] disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
};

export default EditForm;
