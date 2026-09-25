import React from 'react';
import { TriangleAlert } from 'lucide-react';
import { DocumentAlert } from '../../../types/almacen.types';

// Avisos informativos (Fase 8) — nunca bloquean nada, solo se muestran tal cual vienen del backend.
const DocumentAlerts: React.FC<{ alerts: DocumentAlert[] }> = ({ alerts }) => {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-1.5 mb-4">
      {alerts.map((a, i) => (
        <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
          <TriangleAlert size={14} className="flex-shrink-0 mt-0.5" />
          <span>{a.message}</span>
        </div>
      ))}
    </div>
  );
};

export default DocumentAlerts;
