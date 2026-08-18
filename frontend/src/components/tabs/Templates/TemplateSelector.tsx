// src/components/tabs/Templates/TemplateSelector.tsx
//
// Reemplaza el badge fijo "Detallado (default)" de PartidaDetailScreen
// (en PartidasTree.tsx) por un selector real. Mismo tamaño/estilo que
// el badge original: text-[10px], border-gray-300, rounded, bg-white.

import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { TemplateSummary } from '../../../services/templates.service';

interface TemplateSelectorProps {
  templates: TemplateSummary[];
  activeTemplateId: number | null;
  loading?: boolean;
  onSelect: (templateId: number) => void;
}

const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  templates,
  activeTemplateId,
  loading,
  onSelect,
}) => {
  const systemTemplates = templates.filter((t) => t.is_system);
  const ownTemplates = templates.filter((t) => !t.is_system);

  return (
    <div className="relative flex-shrink-0">
      <select
        value={activeTemplateId ?? ''}
        disabled={loading || templates.length === 0}
        onChange={(e) => onSelect(Number(e.target.value))}
        className="appearance-none pl-2 pr-6 py-1 rounded border border-gray-300 bg-white text-[10px] font-semibold text-gray-700 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed hover:border-gray-400 transition-colors cursor-pointer"
      >
        {systemTemplates.length > 0 && (
          <optgroup label="Del sistema">
            {systemTemplates.map((t) => (
              <option key={t.template_id} value={t.template_id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
        {ownTemplates.length > 0 && (
          <optgroup label="Mis plantillas">
            {ownTemplates.map((t) => (
              <option key={t.template_id} value={t.template_id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <ChevronDown
        size={11}
        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400"
      />
    </div>
  );
};

export default TemplateSelector;