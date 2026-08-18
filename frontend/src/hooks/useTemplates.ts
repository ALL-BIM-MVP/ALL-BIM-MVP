// src/hooks/useTemplates.ts
//
// Maneja el ciclo: listar plantillas visibles -> elegir una -> cargarla
// completa (sets/columnas). Es el estado que un selector + una tabla
// de metrados comparten.
//
// LÓGICA DEL FALLBACK: si la BD todavía no tiene sembrada la plantilla
// del sistema "Detallado (default)" que describe la doc, esto NO se
// queda sin nada que mostrar. FALLBACK_DEFAULT_TEMPLATE (template_id
// -1, 100% local, no existe en el backend) se agrega siempre a la
// lista y se selecciona por defecto — salvo que el backend YA tenga su
// propio is_default=true real, en cuyo caso se prefiere ese.
//
// Cuando el usuario crea una plantilla nueva (createTemplate, POST),
// esa sí es una fila real del backend con su propio template_id
// positivo — se agrega AL LADO del fallback en el selector, nunca lo
// reemplaza ni lo pisa.

import { useCallback, useEffect, useState } from 'react';
import {
  FALLBACK_DEFAULT_TEMPLATE,
  FALLBACK_DEFAULT_TEMPLATE_SUMMARY,
  getTemplate,
  listTemplates,
  type TemplateFull,
  type TemplateSummary,
} from '../services/templates.service';

interface UseTemplatesResult {
  templates: TemplateSummary[];
  activeTemplate: TemplateFull | null;
  loadingList: boolean;
  loadingActive: boolean;
  error: string | null;
  selectTemplate: (templateId: number) => Promise<void>;
  refreshList: () => Promise<TemplateSummary[]>;
  // Reemplaza la plantilla activa en memoria sin volver a pegarle al
  // backend — útil después de un PUT/POST/PATCH que ya trae la data
  // actualizada en la respuesta.
  setActiveTemplateLocal: (template: TemplateFull) => void;
}

export function useTemplates(initialTemplateId?: number): UseTemplatesResult {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<TemplateFull | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingActive, setLoadingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectTemplate = useCallback(async (templateId: number) => {
    // -1 = el fallback local — no existe en el backend, no hay nada
    // que pedirle a la API, se resuelve en memoria directo.
    if (templateId === FALLBACK_DEFAULT_TEMPLATE.template_id) {
      setActiveTemplate(FALLBACK_DEFAULT_TEMPLATE);
      setError(null);
      return;
    }
    setLoadingActive(true);
    setError(null);
    try {
      const full = await getTemplate(templateId);
      setActiveTemplate(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la plantilla.');
    } finally {
      setLoadingActive(false);
    }
  }, []);

  const refreshList = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const backendList = await listTemplates('all');
      // El fallback siempre va primero en la lista, salvo que el
      // backend YA tenga su propio is_default=true real — en ese caso
      // no hace falta duplicar, se confía en el real.
      const backendHasRealDefault = backendList.some((t) => t.is_default);
      const list = backendHasRealDefault
        ? backendList
        : [FALLBACK_DEFAULT_TEMPLATE_SUMMARY, ...backendList];
      setTemplates(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las plantillas.');
      // Aunque falle la lista del backend, el fallback sigue estando
      // disponible — nunca te quedás sin ninguna plantilla para elegir.
      setTemplates([FALLBACK_DEFAULT_TEMPLATE_SUMMARY]);
      return [FALLBACK_DEFAULT_TEMPLATE_SUMMARY];
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const list = await refreshList();
      if (initialTemplateId) {
        await selectTemplate(initialTemplateId);
        return;
      }
      const defaultOne = list.find((t) => t.is_default) ?? list[0];
      if (defaultOne) {
        await selectTemplate(defaultOne.template_id);
      }
    })();
    // Solo al montar — cambios de initialTemplateId después no deberían
    // pisar la elección manual del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    templates,
    activeTemplate,
    loadingList,
    loadingActive,
    error,
    selectTemplate,
    refreshList,
    setActiveTemplateLocal: setActiveTemplate,
  };
}