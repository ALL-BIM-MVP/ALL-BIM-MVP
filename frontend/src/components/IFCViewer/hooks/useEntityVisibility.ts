import { useState, useCallback, useEffect } from 'react';
import type { TypeGroup, LevelGroup } from '../types';

type IsolationTarget =
  | { kind: 'type'; value: string }
  | { kind: 'types'; value: Set<string> }
  | { kind: 'levels'; value: Set<string> }
  | { kind: 'element'; value: number }
  | { kind: 'elements'; value: Set<number> }
  | null;

export function useEntityVisibility(
  rendererRef: React.RefObject<any>,
  typeGroups: TypeGroup[],
  levelGroups: LevelGroup[],
  panelOffsetPx = 0
) {
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenElementIds, setHiddenElementIds] = useState<Set<number>>(new Set());
  const [isolation, setIsolation] = useState<IsolationTarget>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(new Set());

  useEffect(() => {
    rendererRef.current?.applyPanelCompensation?.(panelOffsetPx);
    rendererRef.current?.requestRender?.();
  }, [panelOffsetPx, rendererRef]);

  const applyVisibility = useCallback((
    hiddenTypesArg: Set<string>,
    hiddenElementIdsArg: Set<number>,
    isolationArg: IsolationTarget
  ) => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    renderer.clearGroupDimming?.();

    let isolatedIds: Set<number> | null = null;
    if (isolationArg?.kind === 'type') {
      const group = typeGroups.find((g) => g.type === isolationArg.value);
      isolatedIds = new Set(group ? group.ids : []);
    } else if (isolationArg?.kind === 'types') {
      isolatedIds = new Set<number>();
      typeGroups.forEach((g) => {
        if (isolationArg.value.has(g.type)) g.ids.forEach((id) => isolatedIds!.add(id));
      });
    } else if (isolationArg?.kind === 'levels') {
      isolatedIds = new Set<number>();
      levelGroups.forEach((g) => {
        if (isolationArg.value.has(g.type)) g.ids.forEach((id) => isolatedIds!.add(id));
      });
    } else if (isolationArg?.kind === 'element') {
      isolatedIds = new Set([isolationArg.value]);
    } else if (isolationArg?.kind === 'elements') {
      isolatedIds = new Set(isolationArg.value);
    }
    renderer.setIsolatedEntities?.(isolatedIds);

    const hiddenIds = new Set<number>(hiddenElementIdsArg);
    typeGroups.forEach((g) => {
      if (hiddenTypesArg.has(g.type)) g.ids.forEach((id) => hiddenIds.add(id));
    });
    renderer.setHiddenEntities?.(hiddenIds);
    renderer.requestRender?.();
  }, [rendererRef, typeGroups, levelGroups]);

  const toggleHideType = useCallback((type: string) => {
    // Calcular fuera del updater
    const next = new Set(hiddenTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);

    setHiddenTypes(next);
    applyVisibility(next, hiddenElementIds, isolation);
  }, [hiddenTypes, hiddenElementIds, isolation, applyVisibility]);

  const toggleIsolateType = useCallback((type: string) => {
    const nextIsolation: IsolationTarget = 
      isolation?.kind === 'type' && isolation.value === type 
        ? null 
        : { kind: 'type', value: type };

    setSelectedTypes(new Set());
    setSelectedLevels(new Set());
    setIsolation(nextIsolation);
    applyVisibility(hiddenTypes, hiddenElementIds, nextIsolation);
  }, [hiddenTypes, hiddenElementIds, isolation, applyVisibility]);

  const toggleSelectType = useCallback((type: string) => {
    // Calcular fuera del updater
    const next = new Set(selectedTypes);
    if (next.has(type)) next.delete(type);
    else next.add(type);

    const nextIsolation: IsolationTarget = next.size > 0 ? { kind: 'types', value: next } : null;

    setSelectedLevels(new Set());
    setSelectedTypes(next);
    setIsolation(nextIsolation);
    applyVisibility(hiddenTypes, hiddenElementIds, nextIsolation);
  }, [selectedTypes, hiddenTypes, hiddenElementIds, applyVisibility]);

  const toggleSelectLevel = useCallback((level: string) => {
    // Calcular fuera del updater
    const next = new Set(selectedLevels);
    if (next.has(level)) next.delete(level);
    else next.add(level);

    const nextIsolation: IsolationTarget = next.size > 0 ? { kind: 'levels', value: next } : null;

    setSelectedTypes(new Set());
    setSelectedLevels(next);
    setIsolation(nextIsolation);
    applyVisibility(hiddenTypes, hiddenElementIds, nextIsolation);
  }, [selectedLevels, hiddenTypes, hiddenElementIds, applyVisibility]);

  const clearSelectedLevels = useCallback(() => {
    setSelectedLevels(new Set());
    setIsolation(null);
    applyVisibility(hiddenTypes, hiddenElementIds, null);
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  const clearSelectedTypes = useCallback(() => {
    setSelectedTypes(new Set());
    setIsolation(null);
    applyVisibility(hiddenTypes, hiddenElementIds, null);
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  const hideElementById = useCallback((id: number) => {
    const next = new Set(hiddenElementIds);
    next.add(id);
    setHiddenElementIds(next);
    applyVisibility(hiddenTypes, next, isolation);
  }, [hiddenTypes, hiddenElementIds, isolation, applyVisibility]);

  const showElementById = useCallback((id: number) => {
    const next = new Set(hiddenElementIds);
    next.delete(id);
    setHiddenElementIds(next);
    applyVisibility(hiddenTypes, next, isolation);
  }, [hiddenTypes, hiddenElementIds, isolation, applyVisibility]);

  const isolateElementById = useCallback((id: number) => {
    const nextIsolation: IsolationTarget = 
      isolation?.kind === 'element' && isolation.value === id 
        ? null 
        : { kind: 'element', value: id };

    setSelectedTypes(new Set());
    setSelectedLevels(new Set());
    setIsolation(nextIsolation);
    applyVisibility(hiddenTypes, hiddenElementIds, nextIsolation);
  }, [hiddenTypes, hiddenElementIds, isolation, applyVisibility]);

  const isolateElementsByIds = useCallback((ids: number[]) => {
    const nextIsolation: IsolationTarget = ids.length > 0 ? { kind: 'elements', value: new Set(ids) } : null;

    setSelectedTypes(new Set());
    setSelectedLevels(new Set());
    setIsolation(nextIsolation);
    applyVisibility(hiddenTypes, hiddenElementIds, nextIsolation);
    
    if (ids.length > 0) {
      rendererRef.current?.flyToElements?.(ids, panelOffsetPx);
    }
  }, [hiddenTypes, hiddenElementIds, applyVisibility, rendererRef, panelOffsetPx]);

  const clearIsolation = useCallback(() => {
    setSelectedTypes(new Set());
    setSelectedLevels(new Set());
    setIsolation(null);
    applyVisibility(hiddenTypes, hiddenElementIds, null);
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  const clearAllHidden = useCallback(() => {
    setHiddenTypes(new Set());
    setHiddenElementIds(new Set());
    applyVisibility(new Set(), new Set(), isolation);
  }, [isolation, applyVisibility]);

  const clearAll = useCallback(() => {
    setSelectedTypes(new Set());
    setSelectedLevels(new Set());
    setIsolation(null);
    setHiddenTypes(new Set());
    setHiddenElementIds(new Set());
    applyVisibility(new Set(), new Set(), null);
  }, [applyVisibility]);

  return {
    hiddenTypes,
    isolatedType: isolation?.kind === 'type' ? isolation.value : null,
    isolatedElementId: isolation?.kind === 'element' ? isolation.value : null,
    isolatedElementIds: isolation?.kind === 'elements' ? isolation.value : null,
    hiddenElementIds,
    selectedTypes,
    toggleSelectType,
    clearSelectedTypes,
    selectedLevels,
    toggleSelectLevel,
    clearSelectedLevels,
    toggleHideType,
    toggleIsolateType,
    clearIsolation,
    hideElementById,
    showElementById,
    isolateElementById,
    isolateElementsByIds,
    clearAllHidden,
    clearAll,
  };
}