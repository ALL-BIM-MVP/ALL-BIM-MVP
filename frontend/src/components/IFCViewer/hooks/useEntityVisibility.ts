import { useState, useCallback } from 'react';
import type { TypeGroup } from '../types';

type IsolationTarget = { kind: 'type'; value: string } | { kind: 'element'; value: number } | null;

export function useEntityVisibility(
  rendererRef: React.RefObject<any>,
  typeGroups: TypeGroup[]
) {
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenElementIds, setHiddenElementIds] = useState<Set<number>>(new Set());
  const [isolation, setIsolation] = useState<IsolationTarget>(null);

  const applyVisibility = useCallback((
    hiddenTypesArg: Set<string>,
    hiddenElementIdsArg: Set<number>,
    isolationArg: IsolationTarget
  ) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    let isolatedIds: Set<number> | null = null;
    if (isolationArg?.kind === 'type') {
      const group = typeGroups.find((g) => g.type === isolationArg.value);
      isolatedIds = new Set(group ? group.ids : []);
    } else if (isolationArg?.kind === 'element') {
      isolatedIds = new Set([isolationArg.value]);
    }
    renderer.setIsolatedEntities?.(isolatedIds);

    const hiddenIds = new Set<number>(hiddenElementIdsArg);
    typeGroups.forEach((g) => {
      if (hiddenTypesArg.has(g.type)) g.ids.forEach((id) => hiddenIds.add(id));
    });
    renderer.setHiddenEntities?.(hiddenIds);
    renderer.requestRender?.();
  }, [rendererRef, typeGroups]);

  const toggleHideType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      applyVisibility(next, hiddenElementIds, isolation);
      return next;
    });
  }, [hiddenElementIds, isolation, applyVisibility]);

  const toggleIsolateType = useCallback((type: string) => {
    setIsolation((prev) => {
      const next: IsolationTarget = prev?.kind === 'type' && prev.value === type ? null : { kind: 'type', value: type };
      applyVisibility(hiddenTypes, hiddenElementIds, next);
      return next;
    });
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  // 👉 NUEVO: ocultar/aislar un elemento individual (no todo su tipo)
  const hideElementById = useCallback((id: number) => {
    setHiddenElementIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      applyVisibility(hiddenTypes, next, isolation);
      return next;
    });
  }, [hiddenTypes, isolation, applyVisibility]);

  const showElementById = useCallback((id: number) => {
    setHiddenElementIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      applyVisibility(hiddenTypes, next, isolation);
      return next;
    });
  }, [hiddenTypes, isolation, applyVisibility]);

  const isolateElementById = useCallback((id: number) => {
    setIsolation((prev) => {
      const next: IsolationTarget = prev?.kind === 'element' && prev.value === id ? null : { kind: 'element', value: id };
      applyVisibility(hiddenTypes, hiddenElementIds, next);
      return next;
    });
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  const clearIsolation = useCallback(() => {
    setIsolation(null);
    applyVisibility(hiddenTypes, hiddenElementIds, null);
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  const clearAllHidden = useCallback(() => {
    setHiddenTypes(new Set());
    setHiddenElementIds(new Set());
    applyVisibility(new Set(), new Set(), isolation);
  }, [isolation, applyVisibility]);

  return {
    hiddenTypes,
    isolatedType: isolation?.kind === 'type' ? isolation.value : null,
    isolatedElementId: isolation?.kind === 'element' ? isolation.value : null,
    hiddenElementIds,
    toggleHideType,
    toggleIsolateType,
    clearIsolation,
    hideElementById,
    showElementById,
    isolateElementById,
    clearAllHidden,
  };
}