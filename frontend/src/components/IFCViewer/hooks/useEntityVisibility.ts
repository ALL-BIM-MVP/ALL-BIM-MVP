import { useState, useCallback } from 'react';
import type { TypeGroup } from '../types';

type IsolationTarget =
  | { kind: 'type'; value: string }
  | { kind: 'types'; value: Set<string> }
  | { kind: 'element'; value: number }
  | { kind: 'elements'; value: Set<number> }
  | null;

export function useEntityVisibility(
  rendererRef: React.RefObject<any>,
  typeGroups: TypeGroup[]
) {
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenElementIds, setHiddenElementIds] = useState<Set<number>>(new Set());
  const [isolation, setIsolation] = useState<IsolationTarget>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

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
    } else if (isolationArg?.kind === 'types') {
      isolatedIds = new Set<number>();
      typeGroups.forEach((g) => {
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
    setSelectedTypes(new Set());
    setIsolation((prev) => {
      const next: IsolationTarget = prev?.kind === 'type' && prev.value === type ? null : { kind: 'type', value: type };
      applyVisibility(hiddenTypes, hiddenElementIds, next);
      return next;
    });
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  const toggleSelectType = useCallback((type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);

      const nextIsolation: IsolationTarget = next.size > 0 ? { kind: 'types', value: next } : null;
      setIsolation(nextIsolation);
      applyVisibility(hiddenTypes, hiddenElementIds, nextIsolation);
      return next;
    });
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  const clearSelectedTypes = useCallback(() => {
    setSelectedTypes(new Set());
    setIsolation(null);
    applyVisibility(hiddenTypes, hiddenElementIds, null);
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

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
    setSelectedTypes(new Set());
    setIsolation((prev) => {
      const next: IsolationTarget = prev?.kind === 'element' && prev.value === id ? null : { kind: 'element', value: id };
      applyVisibility(hiddenTypes, hiddenElementIds, next);
      return next;
    });
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  const isolateElementsByIds = useCallback((ids: number[]) => {
    setSelectedTypes(new Set());
    const next: IsolationTarget = ids.length > 0 ? { kind: 'elements', value: new Set(ids) } : null;
    setIsolation(next);
    applyVisibility(hiddenTypes, hiddenElementIds, next);
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  const clearIsolation = useCallback(() => {
    setSelectedTypes(new Set());
    setIsolation(null);
    applyVisibility(hiddenTypes, hiddenElementIds, null);
  }, [hiddenTypes, hiddenElementIds, applyVisibility]);

  const clearAllHidden = useCallback(() => {
    setHiddenTypes(new Set());
    setHiddenElementIds(new Set());
    applyVisibility(new Set(), new Set(), isolation);
  }, [isolation, applyVisibility]);

  // Deshace aislamiento Y ocultamiento en UNA sola operación atómica —
  // a diferencia de llamar clearIsolation() + clearAllHidden() seguidas
  // (lo que hacía el botón "Mostrar todo" antes), que tenía un bug de
  // closure obsoleta: clearAllHidden() todavía leía el `isolation` VIEJO
  // en su cierre (React no había vuelto a renderizar todavía entre una
  // llamada y la otra), así que terminaba reaplicando el aislamiento que
  // clearIsolation() acababa de sacar, un instante después. Acá se
  // resetean los 4 estados y se llama applyVisibility UNA sola vez, con
  // valores definitivos (todo vacío/null), sin closures intermedias.
  const clearAll = useCallback(() => {
    setSelectedTypes(new Set());
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