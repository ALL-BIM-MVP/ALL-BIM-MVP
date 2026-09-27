import React from 'react';
import { DraftWarning } from '../../../types/almacen.types';

// flag: "ai" = lo llenó la IA (a revisar); "warn" = lo llenó la IA y además tiene un aviso.
export type FieldFlag = 'ai' | 'warn' | undefined;

export const flagClass = (flag: FieldFlag) =>
  flag === 'warn' ? 'border-amber-400 bg-amber-50' : flag === 'ai' ? 'border-violet-300 bg-violet-50' : 'border-gray-200';

export const Field: React.FC<{
  label: string; value?: string; onChange?: (v: string) => void; type?: string; className?: string; placeholder?: string;
  required?: boolean; flag?: FieldFlag; message?: string; hint?: string;
}> = ({ label, value, onChange, type = 'text', className, placeholder, required, flag, message, hint }) => (
  <label className={`block ${className || ''}`}>
    <span className="text-[11px] text-gray-500 font-medium">{label}{required && <span className="text-red-500"> *</span>}</span>
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange?.(e.target.value)}
      className={`w-full mt-1 px-2.5 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#0056b3]/30 focus:border-[#0056b3] ${flagClass(flag)}`}
    />
    {message && <span className="block text-[11px] text-amber-600 mt-0.5">{message}</span>}
    {hint && !message && <span className="block text-[11px] text-gray-400 mt-0.5">{hint}</span>}
  </label>
);

// Los avisos más graves primero: un "documento repetido" no puede quedar debajo de uno cosmético.
const WARNING_ORDER = ['DUPLICATE_DOCUMENT', 'DETECTED_TYPE_MISMATCH', 'NO_ITEMS'];
export const sortWarnings = (warnings: DraftWarning[]) =>
  [...warnings].sort((a, b) => {
    const ra = WARNING_ORDER.indexOf(a.code); const rb = WARNING_ORDER.indexOf(b.code);
    return (ra === -1 ? WARNING_ORDER.length : ra) - (rb === -1 ? WARNING_ORDER.length : rb);
  });

/** Avisos generales (los que no señalan un campo del encabezado) y notas de lectura, arriba del formulario. */
export const DraftNotices: React.FC<{ warnings: DraftWarning[]; readNotes: string[] }> = ({ warnings, readNotes }) => {
  if (warnings.length === 0 && readNotes.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
      <p className="text-xs font-semibold text-amber-700 mb-1">Revisa esto antes de guardar</p>
      <ul className="text-xs text-amber-700 list-disc pl-4 space-y-0.5">
        {warnings.map((w, i) => <li key={`w${i}`}>{w.message}</li>)}
        {readNotes.map((n, i) => <li key={`n${i}`}>{n}</li>)}
      </ul>
    </div>
  );
};
