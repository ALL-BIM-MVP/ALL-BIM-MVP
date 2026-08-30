// Fase 3 de la migración a ThatOpen/Fragments — filtro por
// categoría/nivel (CategoryFilterPanel) Y ocultar/aislar un elemento
// puntual (popup flotante de selección) para el camino de Fragments.
//
// Categorías: model.getItemsOfCategories([/.*/]) trae directo un mapa
// categoría -> localIds — no hace falta ningún worker propio como en
// el camino viejo (ifcWorker.ts).
//
// Niveles: no hay una función directa para esto. model.getSpatialStructure()
// devuelve el árbol IFC (Proyecto -> Sitio -> Edificio -> Piso ->
// elementos) como SpatialTreeItem — cada nodo trae category/localId,
// pero NO el nombre. Para el nombre real de cada IFCBUILDINGSTOREY hace
// falta pedirlo aparte con getItemsData(...), mismo patrón que ya usa
// useFragmentsSelection.ts para el panel de propiedades.
//
// Aislar: a diferencia del camino viejo (que OCULTA por completo lo
// que no está aislado, vía flags de vértice en el shader — ver
// ThreeSceneController.applyVisibilityFlags, discard si vHidden>0.5),
// acá se ATENÚA — se ve la silueta de lo no aislado en vez de que
// desaparezca del todo. PERO: NO se usa model.setOpacity(ids, opacity)
// para esto (ver GHOST_MATERIAL más abajo, y el comentario largo junto
// a applyIsolation, para el motivo exacto) — es un límite real de la
// librería, no una preferencia nuestra.
import { useRef, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import type { TypeGroup, LevelGroup } from '../types';

// Material fijo para "atenuar" — a propósito SIN preserveOriginalMaterial
// (a diferencia de HIGHLIGHT_MATERIAL en useFragmentsSelection.ts, que
// sí lo necesita porque solo toca color/opacidad puntuales sobre la
// selección). Acá, sin ese flag, la librería SÍ deduplica por valor
// (MaterialManager.checkMaterialExists/MaterialUtils.isSame — mismo
// color+opacidad+caras reusa el mismo índice ya creado) — así que
// mandar este mismo objeto una y otra vez, por muchos toggles que
// hagas, solo crea una entrada nueva la PRIMERA vez. Ver el comentario
// largo junto a applyIsolation para el motivo (un límite real de la
// librería que hace justamente esto necesario).
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

export function useFragmentsEntityVisibility(
  storeRef: React.RefObject<any>,
  ready: boolean
) {
  const [fragmentsTypeGroups, setFragmentsTypeGroups] = useState<TypeGroup[]>([]);
  const [fragmentsLevelGroups, setFragmentsLevelGroups] = useState<LevelGroup[]>([]);
  const [fragmentsSelectedTypes, setFragmentsSelectedTypes] = useState<Set<string>>(new Set());
  const [fragmentsSelectedLevels, setFragmentsSelectedLevels] = useState<Set<string>>(new Set());
  // Aislar UN elemento puntual (popup flotante de selección — botón
  // "Aislar") — comparte toda la infraestructura de arriba (mismo
  // applyIsolation/dimmedIdsRef/GHOST_MATERIAL), solo agrega el kind
  // 'element' al target. "Ocultar" en cambio es un mecanismo aparte:
  // no atenúa, oculta de verdad con model.setVisible — ver
  // hideFragmentsElementById más abajo.
  const [isolatedFragmentsElementId, setIsolatedFragmentsElementId] = useState<number | null>(null);
  // Aislar una LISTA de elementos (botón "aislar partida"/"aislar
  // grupo" de PartidasTree.tsx/MetradosTable.tsx) — estado aparte de
  // isolatedFragmentsElementId (un solo elemento, popup de selección)
  // para que hasAnyIsolation en IFCViewer.tsx (que controla si se
  // muestra el botón "Mostrar todo el modelo") también detecte este
  // caso. Sin esto, aislar por partida atenuaba el modelo mostrando el
  // ojo de "volver a la vista completa" oculto, sin forma de deshacerlo.
  const [isolatedFragmentsElementIds, setIsolatedFragmentsElementIds] = useState<Set<number> | null>(null);
  const [hiddenFragmentsElementIds, setHiddenFragmentsElementIds] = useState<Set<number>>(new Set());

  // Refs espejo de los grupos — para que applyIsolation (un useCallback
  // con identidad estable) siempre lea el valor último sin tener que
  // llevar typeGroups/levelGroups en su lista de dependencias.
  const typeGroupsRef = useRef<TypeGroup[]>([]);
  const levelGroupsRef = useRef<LevelGroup[]>([]);
  const allIdsRef = useRef<number[]>([]);
  // Espejo de selectedTypes/selectedLevels — hace falta leer el valor
  // actual FUERA del updater de setState (ver toggleFragmentsSelect*
  // más abajo): applyIsolation es async, y StrictMode (dev) ejecuta dos
  // veces cualquier updater de setState a propósito para detectar
  // efectos impuros — si el cálculo de "next" + la llamada a
  // applyIsolation vivieran adentro del updater, esas dos ejecuciones
  // disparan dos llamadas async superpuestas contra Fragments.
  const selectedTypesRef = useRef<Set<string>>(new Set());
  const selectedLevelsRef = useRef<Set<string>>(new Set());
  const isolatedElementIdRef = useRef<number | null>(null);
  const hiddenElementIdsRef = useRef<Set<number>>(new Set());
  // Qué localIds quedaron atenuados la última vez — así applyIsolation
  // puede calcular la diferencia contra el nuevo estado en vez de
  // reprocesar todo el modelo en cada toggle (ver el comentario largo ahí).
  const dimmedIdsRef = useRef<Set<number>>(new Set());

  // Botón "pausar/reanudar atenuado" — a diferencia de "Mostrar todo el
  // modelo" (que BORRA el aislamiento para siempre), esto solo lo
  // esconde visualmente sin olvidar qué estaba aislado: dimmedIdsRef NO
  // se toca acá, así que reanudar vuelve a atenuar exactamente el mismo
  // conjunto sin tener que volver a clickear la partida/grupo/categoría
  // que lo generó. Funciona sea cual sea el mecanismo que aisló (partida
  // completa, categoría/nivel, un elemento puntual) porque todos pasan
  // por el mismo dimmedIdsRef.
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
          allIds.push(...ids);
          return { type, ids };
        });
        allIdsRef.current = allIds;
        typeGroupsRef.current = groups;
        setFragmentsTypeGroups(groups);

        const tree = await model.getSpatialStructure();
        // SpatialTreeItem alterna nodos "categoría" (localId: null,
        // agrupa por tipo — ej. category: 'IFCBUILDINGSTOREY') con
        // nodos "ítem" (category: null, localId real) — un piso real
        // NO es el nodo 'IFCBUILDINGSTOREY' en sí (ese siempre tiene
        // localId: null), son sus HIJOS directos, cada uno un piso con
        // su propio localId. Confirmado en vivo con console.debug del
        // árbol devuelto por getSpatialStructure().
        const storeyNodes: { localId: number; ids: number[] }[] = [];
        const collectIds = (node: any, into: number[]) => {
          if (node.localId != null) into.push(node.localId);
          for (const child of node.children ?? []) collectIds(child, into);
        };
        const walk = (node: any) => {
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
            return; // no hay IFCBUILDINGSTOREY anidados dentro de otro
          }
          for (const child of node.children ?? []) walk(child);
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

  // Cola de aplicación — applyIsolation lee dimmedIdsRef al empezar y
  // recién lo escribe al final, después de awaits reales contra el
  // worker de Fragments (resetHighlight/highlight). Si se llama de
  // nuevo antes de que la anterior termine (tildar varios casilleros
  // rápido, uno atrás del otro), esa segunda llamada leería el estado
  // viejo, y las dos peticiones al worker podrían resolver en
  // cualquier orden. Encolando (cada llamada nueva se engancha al
  // final de la promesa anterior, nunca se superponen) cada aplicación
  // ve siempre el estado que dejó la anterior, en el orden real de tildado.
  const applyQueueRef = useRef<Promise<void>>(Promise.resolve());

  const applyIsolation = useCallback((target: FragIsolationTarget) => {
    applyQueueRef.current = applyQueueRef.current
      .catch(() => {})
      .then(async () => {
        const model = storeRef.current?.fragmentsModel;
        if (!model) return;

        // Si el atenuado estaba oculto del todo (ver toggleIsolationPause
        // — setVisible false, no solo gris/translúcido), eso tiene que
        // SEGUIR oculto pase lo que pase con la selección — pedido
        // explícito del usuario: solo el botón de ocultar/mostrar lo
        // reactiva, ningún cambio de partida/grupo/categoría de por
        // medio. Por eso acá NO se restaura visibilidad ni se sale de
        // "oculto" solo por cambiar de target — ver más abajo cómo
        // toReset/toDim manejan la visibilidad manteniendo ese estado.
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

        // Solo tocar la DIFERENCIA contra la vez anterior — evita
        // reenviar ids que ya estaban en el estado correcto en cada
        // toggle (aparte de ser trabajo de más, ver por qué esto
        // importa especialmente acá en el comentario de GHOST_MATERIAL
        // y el de resetHighlight más abajo).
        //
        // Para "destildar" se usa model.resetHighlight (NO
        // model.resetOpacity): resetOpacity, internamente, solo saca
        // opacity/transparent de la definición pero deja un campo
        // interno (_explicitProps) colgado — HighlightHelper.
        // hasEffectiveProperties todavía ve ese campo como "propiedad
        // efectiva", así que el ítem NUNCA vuelve realmente a "sin
        // highlight": queda con un índice de material nuevo cada vez
        // (confirmado leyendo el código de la librería). resetHighlight,
        // en cambio, asigna directo el índice de material 0 (ver
        // HighlightHelper.resetHighlightForItems) — sin crear ninguna
        // entrada nueva.
        const toReset: number[] = [];
        prevDimmed.forEach((id) => { if (!nextDimmed.has(id)) toReset.push(id); });
        if (toReset.length > 0) {
          await model.resetHighlight(toReset);
          // Estos ids dejan de estar atenuados (pasan a "aislados"/
          // visibles normales) — si estaban ocultos del todo por el
          // botón de ocultar/mostrar, tienen que volver a verse SÍ o SÍ,
          // sin esperar a que se toque ese botón — lo oculto es
          // específicamente "lo atenuado", y esto ya dejó de serlo.
          if (isolationPausedRef.current) await model.setVisible(toReset, true);
        }

        // model.highlight(ids, GHOST_MATERIAL) — NO model.setOpacity.
        // setOpacity arma el material con preserveOriginalMaterial:true,
        // que a propósito SE SALTA la deduplicación de la librería
        // (VirtualMaterialController.checkMaterialExists: si ese flag
        // está, siempre "no existe todavía", nunca reusa un índice ya
        // creado). El índice de material de cada ítem se guarda como
        // Uint16 (ItemConfigController._highlightData) — tope real: 65536
        // valores DISTINTOS en toda la vida del modelo cargado, sin
        // límite de reciclado. Con setOpacity, cada toggle del mismo
        // casillero crea entradas nuevas para todo "lo no aislado" otra
        // vez — con un modelo de unos miles de elementos, una docena de
        // toggles ya alcanza para pasarse ese tope y que el atenuado
        // empiece a fallar silenciosamente. Con highlight() + un
        // material SIN preserveOriginalMaterial, la librería sí
        // deduplica por valor (mismo color+opacidad+caras reusa el
        // mismo índice) — así que GHOST_MATERIAL solo crea una entrada
        // la primera vez, sin importar cuántas veces se togglee.
        const toDim: number[] = [];
        nextDimmed.forEach((id) => { if (!prevDimmed.has(id)) toDim.push(id); });
        if (toDim.length > 0) {
          await model.highlight(toDim, GHOST_MATERIAL);
          // Si "lo atenuado" está oculto del todo ahora mismo, estos ids
          // NUEVOS que se suman al atenuado tienen que nacer ocultos
          // también — si no, se verían aparecer en gris un instante
          // aunque el botón siga en "oculto".
          if (isolationPausedRef.current) await model.setVisible(toDim, false);
        }

        dimmedIdsRef.current = nextDimmed;
      })
      .catch((err) => {
        console.warn('[useFragmentsEntityVisibility] error al aplicar aislamiento:', err);
      });
  }, [storeRef]);

  // Botón "ocultar/mostrar atenuado" — a diferencia de "Mostrar todo el
  // modelo" (clearFragmentsAll, más abajo, que BORRA el aislamiento
  // para siempre), esto no toca dimmedIdsRef ni ningún otro estado de
  // qué está aislado, y NO le saca el GHOST_MATERIAL a nadie — solo
  // alterna la VISIBILIDAD (model.setVisible) del conjunto atenuado.
  // Pedido explícito del usuario: no quería ver el atenuado en gris
  // translúcido, quería que esos elementos desaparezcan del todo (fondo
  // blanco/vacío en su lugar) — no un simple "mostrar todo normal".
  // Funciona sea cual sea el mecanismo que aisló (partida completa,
  // categoría/nivel, un elemento puntual) porque todos comparten
  // dimmedIdsRef. Encolado en el mismo applyQueueRef que applyIsolation
  // para no pisarse con un aislamiento nuevo resolviendo al mismo tiempo.
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
  const isolateFragmentsElementsByIds = useCallback((ids: number[]) => {
    setFragmentsSelectedTypes(new Set());
    setFragmentsSelectedLevels(new Set());
    setIsolatedFragmentsElementId(null);
    setIsolatedFragmentsElementIds(ids.length > 0 ? new Set(ids) : null);
    applyIsolation(ids.length > 0 ? { kind: 'elements', value: new Set(ids) } : null);
  }, [applyIsolation]);

  // Botón "Ocultar" del popup flotante de selección — a diferencia de
  // aislar, esto NO atenúa: oculta de verdad con model.setVisible (el
  // mismo mecanismo binario que usa Fragments para visibilidad, sin
  // relación con el sistema de highlight/opacidad de arriba).
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