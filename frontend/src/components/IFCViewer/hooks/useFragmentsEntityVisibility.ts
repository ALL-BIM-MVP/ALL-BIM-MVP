
import { useRef, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import type { TypeGroup, LevelGroup } from '../types';


const GHOST_MATERIAL = {
  color: new THREE.Color(0x9ca3af),
  renderedFaces: 1, // RenderedFaces.TWO — mismo criterio que HIGHLIGHT_MATERIAL
  opacity: 0.06,
  transparent: true,
} as const;

type FragIsolationTarget =
  | { kind: 'types'; value: Set<string> }
  | { kind: 'levels'; value: Set<string> }
  | { kind: 'element'; value: number }
  | { kind: 'elements'; value: Set<number> }
  | null;

// Traduce express_id -> localId de Fragments vía global_id (GUID),
// para cualquier llamador que reciba ids "crudos" del IFC (metrado_elements,
// PartidasTree.tsx) en vez del localId interno de Fragments — ver el
// comentario largo junto a isolateFragmentsElementsByIds más abajo.
// Reutilizado desde useIfcModel.ts (selectFragmentsGroupInViewer).
export async function resolveFragmentsLocalIds(
  model: any,
  expressIds: number[],
  globalIds?: (string | null)[]
): Promise<number[]> {
  if (!globalIds || !model) return expressIds;
  const guids = globalIds.filter((g): g is string => !!g);
  if (guids.length === 0) return expressIds;
  try {
    const localIds = await model.getLocalIdsByGuids(guids);
    return localIds.filter((id: number | null): id is number => id != null);
  } catch (err) {
    console.warn('[useFragmentsEntityVisibility] error al traducir global_id a localId de Fragments:', err);
    return expressIds;
  }
}

export function useFragmentsEntityVisibility(
  storeRef: React.RefObject<any>,
  ready: boolean
) {
  const [fragmentsTypeGroups, setFragmentsTypeGroups] = useState<TypeGroup[]>([]);
  const [fragmentsLevelGroups, setFragmentsLevelGroups] = useState<LevelGroup[]>([]);
  const [fragmentsSelectedTypes, setFragmentsSelectedTypes] = useState<Set<string>>(new Set());
  const [fragmentsSelectedLevels, setFragmentsSelectedLevels] = useState<Set<string>>(new Set());

  const [isolatedFragmentsElementId, setIsolatedFragmentsElementId] = useState<number | null>(null);

  const [isolatedFragmentsElementIds, setIsolatedFragmentsElementIds] = useState<Set<number> | null>(null);
  const [hiddenFragmentsElementIds, setHiddenFragmentsElementIds] = useState<Set<number>>(new Set());

  // Refs espejo de los grupos — para que applyIsolation (un useCallback
  // con identidad estable) siempre lea el valor último sin tener que
  // llevar typeGroups/levelGroups en su lista de dependencias.
  const typeGroupsRef = useRef<TypeGroup[]>([]);
  const levelGroupsRef = useRef<LevelGroup[]>([]);
  const allIdsRef = useRef<number[]>([]);

  const selectedTypesRef = useRef<Set<string>>(new Set());
  const selectedLevelsRef = useRef<Set<string>>(new Set());
  const isolatedElementIdRef = useRef<number | null>(null);
  const hiddenElementIdsRef = useRef<Set<number>>(new Set());
  // Qué localIds quedaron atenuados la última vez — así applyIsolation
  // puede calcular la diferencia contra el nuevo estado en vez de
  // reprocesar todo el modelo en cada toggle (ver el comentario largo ahí).
  const dimmedIdsRef = useRef<Set<number>>(new Set());


  const [isolationPaused, setIsolationPaused] = useState(false);
  const isolationPausedRef = useRef(false);
  useEffect(() => { isolationPausedRef.current = isolationPaused; }, [isolationPaused]);

  useEffect(() => { selectedTypesRef.current = fragmentsSelectedTypes; }, [fragmentsSelectedTypes]);
  useEffect(() => { selectedLevelsRef.current = fragmentsSelectedLevels; }, [fragmentsSelectedLevels]);
  useEffect(() => { isolatedElementIdRef.current = isolatedFragmentsElementId; }, [isolatedFragmentsElementId]);
  useEffect(() => { hiddenElementIdsRef.current = hiddenFragmentsElementIds; }, [hiddenFragmentsElementIds]);

  useEffect(() => {
    if (!ready) return;
    const model = storeRef.current?.fragmentsModel;
    if (!model) return;

    let cancelled = false;
    (async () => {
      try {
        const byCategory: Record<string, number[]> = await model.getItemsOfCategories([/.*/]);
        if (cancelled) return;
        const allIds: number[] = [];
        const groups: TypeGroup[] = Object.entries(byCategory).map(([type, ids]) => {
          
          for (const id of ids) allIds.push(id);
          return { type, ids };
        });
        allIdsRef.current = allIds;
        typeGroupsRef.current = groups;
        setFragmentsTypeGroups(groups);

        const tree = await model.getSpatialStructure();
        
        const storeyNodes: { localId: number; ids: number[] }[] = [];
        
        const collectIds = (root: any, into: number[]) => {
          const stack = [root];
          while (stack.length > 0) {
            const node = stack.pop();
            if (node.localId != null) into.push(node.localId);
            for (const child of node.children ?? []) stack.push(child);
          }
        };
        const walk = (root: any) => {
          const stack = [root];
          while (stack.length > 0) {
            const node = stack.pop();
            if (node.category === 'IFCBUILDINGSTOREY') {
              for (const storeyItem of node.children ?? []) {
                if (storeyItem.localId == null) continue;
                const ids: number[] = [];
                // Los hijos del piso (no el piso en sí, que no tiene
                // geometría propia) son los grupos IFCSLAB/IFCWALL/etc.
                // con los elementos reales.
                for (const child of storeyItem.children ?? []) collectIds(child, ids);
                storeyNodes.push({ localId: storeyItem.localId, ids });
              }
              continue; // no hay IFCBUILDINGSTOREY anidados dentro de otro
            }
            for (const child of node.children ?? []) stack.push(child);
          }
        };
        if (tree) walk(tree);
        if (cancelled) return;

        if (storeyNodes.length === 0) {
          levelGroupsRef.current = [];
          setFragmentsLevelGroups([]);
        } else {
          const storeyIds = storeyNodes.map((s) => s.localId);
          const data: Record<string, any>[] = await model.getItemsData(storeyIds, { attributesDefault: true });
          if (cancelled) return;
          const levelGroups: LevelGroup[] = storeyNodes.map((s, i) => ({
            type: data[i]?.Name?.value ?? 'Sin nivel',
            ids: s.ids,
          }));
          levelGroupsRef.current = levelGroups;
          setFragmentsLevelGroups(levelGroups);
        }
      } catch (err) {
        console.warn('[useFragmentsEntityVisibility] error cargando categorías/niveles:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [ready, storeRef]);


  const applyQueueRef = useRef<Promise<void>>(Promise.resolve());

  const applyIsolation = useCallback((target: FragIsolationTarget) => {
    applyQueueRef.current = applyQueueRef.current
      .catch(() => {})
      .then(async () => {
        const model = storeRef.current?.fragmentsModel;
        if (!model) return;

   
        const prevDimmed = dimmedIdsRef.current;

        if (!target) {
          // "Mostrar todo el modelo" — clear total, acá sí se sale de
          // "oculto" (no queda nada aislado para seguir escondiendo).
          if (prevDimmed.size > 0) {
            if (isolationPausedRef.current) await model.setVisible(Array.from(prevDimmed), true);
            await model.resetHighlight(Array.from(prevDimmed));
          }
          if (isolationPausedRef.current) {
            isolationPausedRef.current = false;
            setIsolationPaused(false);
          }
          dimmedIdsRef.current = new Set();
          return;
        }

        const isolatedIds = new Set<number>();
        if (target.kind === 'element') {
          isolatedIds.add(target.value);
        } else if (target.kind === 'elements') {
          target.value.forEach((id) => isolatedIds.add(id));
        } else {
          const groups = target.kind === 'types' ? typeGroupsRef.current : levelGroupsRef.current;
          groups.forEach((g) => {
            if (target.value.has(g.type)) g.ids.forEach((id) => isolatedIds.add(id));
          });
        }

        const nextDimmed = new Set(allIdsRef.current.filter((id) => !isolatedIds.has(id)));

        const toReset: number[] = [];
        prevDimmed.forEach((id) => { if (!nextDimmed.has(id)) toReset.push(id); });
        if (toReset.length > 0) {
          await model.resetHighlight(toReset);
         
          if (isolationPausedRef.current) await model.setVisible(toReset, true);
        }

  
        const toDim: number[] = [];
        nextDimmed.forEach((id) => { if (!prevDimmed.has(id)) toDim.push(id); });
        if (toDim.length > 0) {
          await model.highlight(toDim, GHOST_MATERIAL);
        
          if (isolationPausedRef.current) await model.setVisible(toDim, false);
        }

        dimmedIdsRef.current = nextDimmed;
      })
      .catch((err) => {
        console.warn('[useFragmentsEntityVisibility] error al aplicar aislamiento:', err);
      });
  }, [storeRef]);

  const toggleIsolationPause = useCallback(() => {
    applyQueueRef.current = applyQueueRef.current
      .catch(() => {})
      .then(async () => {
        const model = storeRef.current?.fragmentsModel;
        if (!model) return;
        const ids = Array.from(dimmedIdsRef.current);
        if (ids.length === 0) return; // nada atenuado ahora mismo, no hay nada que ocultar/mostrar

        if (!isolationPausedRef.current) {
          await model.setVisible(ids, false); // ocultar del todo (no solo atenuar)
        } else {
          await model.setVisible(ids, true); // mostrar de nuevo — siguen con GHOST_MATERIAL puesto
        }
        isolationPausedRef.current = !isolationPausedRef.current;
        setIsolationPaused(isolationPausedRef.current);
      })
      .catch((err) => {
        console.warn('[useFragmentsEntityVisibility] error al ocultar/mostrar el atenuado:', err);
      });
  }, [storeRef]);

  const toggleFragmentsSelectType = useCallback((type: string) => {
    const next = new Set(selectedTypesRef.current);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setFragmentsSelectedLevels(new Set());
    setFragmentsSelectedTypes(next);
    setIsolatedFragmentsElementIds(null);
    applyIsolation(next.size > 0 ? { kind: 'types', value: next } : null);
  }, [applyIsolation]);

  const toggleFragmentsSelectLevel = useCallback((level: string) => {
    const next = new Set(selectedLevelsRef.current);
    if (next.has(level)) next.delete(level);
    else next.add(level);
    setFragmentsSelectedTypes(new Set());
    setFragmentsSelectedLevels(next);
    setIsolatedFragmentsElementIds(null);
    applyIsolation(next.size > 0 ? { kind: 'levels', value: next } : null);
  }, [applyIsolation]);

  const clearFragmentsSelectedTypes = useCallback(() => {
    setFragmentsSelectedTypes(new Set());
    applyIsolation(null);
  }, [applyIsolation]);

  const clearFragmentsSelectedLevels = useCallback(() => {
    setFragmentsSelectedLevels(new Set());
    applyIsolation(null);
  }, [applyIsolation]);

  // Botón "Aislar" del popup flotante de selección — toggle: tocarlo
  // de nuevo sobre el mismo elemento ya aislado lo destildar. Comparte
  // applyIsolation con categorías/niveles (mismo mecanismo de atenuado).
  const isolateFragmentsElementById = useCallback((id: number) => {
    const next = isolatedElementIdRef.current === id ? null : id;
    setFragmentsSelectedTypes(new Set());
    setFragmentsSelectedLevels(new Set());
    setIsolatedFragmentsElementId(next);
    setIsolatedFragmentsElementIds(null);
    applyIsolation(next != null ? { kind: 'element', value: next } : null);
  }, [applyIsolation]);

  // Aislar una LISTA de elementos (no uno solo) — usado por "apretar una
  // partida" en PartidasTree.tsx (aísla todos los elementos de esa
  // partida) y por selectGroupInViewer (aísla un subgrupo dentro de una
  // partida). Mismo mecanismo que isolateFragmentsElementById, pero sin
  // toggle: cada llamada reemplaza el aislamiento anterior sea cual sea
  // (igual que isolateElementsByIds en useEntityVisibility.ts, la
  // versión vieja para web-ifc que esto reemplaza cuando el modelo
  // cargó por Fragments).
  //
  // expressIds vienen de metrado_elements (el express_id del IFC crudo)
  // — NO tienen relación con el localId interno de Fragments (ver punto
  // 7 de docs/roadmap/pendientes-sin-definir-frontend.md). globalIds es
  // el global_id (GUID) que el backend ahora manda 1:1 con cada
  // express_id — se usa acá para traducir a localId vía
  // model.getLocalIdsByGuids antes de aislar. Sin globalIds (llamador
  // viejo) se cae al comportamiento anterior, tratando expressIds como
  // si ya fueran localIds.
  const isolateFragmentsElementsByIds = useCallback(async (
    expressIds: number[],
    globalIds?: (string | null)[]
  ) => {
    const ids = await resolveFragmentsLocalIds(storeRef.current?.fragmentsModel, expressIds, globalIds);
    setFragmentsSelectedTypes(new Set());
    setFragmentsSelectedLevels(new Set());
    setIsolatedFragmentsElementId(null);
    setIsolatedFragmentsElementIds(ids.length > 0 ? new Set(ids) : null);
    applyIsolation(ids.length > 0 ? { kind: 'elements', value: new Set(ids) } : null);
  }, [applyIsolation, storeRef]);


  const hideFragmentsElementById = useCallback((id: number) => {
    const model = storeRef.current?.fragmentsModel;
    const next = new Set(hiddenElementIdsRef.current);
    next.add(id);
    setHiddenFragmentsElementIds(next);
    if (model) {
      model.setVisible([id], false).catch((err: unknown) => {
        console.warn('[useFragmentsEntityVisibility] error al ocultar elemento:', err);
      });
    }
  }, [storeRef]);

  // Botón "Mostrar todo el modelo" — limpia categorías/niveles/
  // elemento aislado (vía applyIsolation(null)) y además muestra de
  // nuevo cualquier elemento que se haya ocultado individualmente.
  const clearFragmentsAll = useCallback(() => {
    const model = storeRef.current?.fragmentsModel;
    setFragmentsSelectedTypes(new Set());
    setFragmentsSelectedLevels(new Set());
    setIsolatedFragmentsElementId(null);
    setIsolatedFragmentsElementIds(null);
    const hiddenIds = Array.from(hiddenElementIdsRef.current);
    setHiddenFragmentsElementIds(new Set());
    applyIsolation(null);
    if (model && hiddenIds.length > 0) {
      model.setVisible(hiddenIds, true).catch((err: unknown) => {
        console.warn('[useFragmentsEntityVisibility] error al mostrar elementos ocultos:', err);
      });
    }
  }, [applyIsolation, storeRef]);

  return {
    fragmentsTypeGroups,
    fragmentsSelectedTypes,
    toggleFragmentsSelectType,
    clearFragmentsSelectedTypes,
    fragmentsLevelGroups,
    fragmentsSelectedLevels,
    toggleFragmentsSelectLevel,
    clearFragmentsSelectedLevels,
    isolatedFragmentsElementId,
    isolatedFragmentsElementIds,
    hiddenFragmentsElementIds,
    isolateFragmentsElementById,
    isolateFragmentsElementsByIds,
    hideFragmentsElementById,
    clearFragmentsAll,
    isolationPaused,
    toggleIsolationPause,
  };
}