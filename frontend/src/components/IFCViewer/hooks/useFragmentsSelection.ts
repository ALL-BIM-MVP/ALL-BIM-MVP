
import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import type { SelectedEntity } from '../types';

interface ScreenPos { x: number; y: number; }

const HIGHLIGHT_MATERIAL = {
  color: new THREE.Color(0x00e5ff),
  renderedFaces: 1, // RenderedFaces.TWO — ambas caras, para que no "desaparezca" en superficies finas
  opacity: 1,
  transparent: false,
} as const;

function itemDataToSelectedEntity(localId: number, data: Record<string, any>): SelectedEntity {
  const isDefinedBy = Array.isArray(data?.IsDefinedBy) ? data.IsDefinedBy : [];
  const propertySets = isDefinedBy
    .filter((pset: any) => Array.isArray(pset?.HasProperties))
    .map((pset: any) => ({
      name: pset?.Name?.value ?? 'Sin nombre',
      properties: (pset.HasProperties as any[]).map((prop) => ({
        name: prop?.Name?.value ?? '',
        value: prop?.NominalValue?.value ?? '',
      })),
    }));

  return {
    expressId: localId, // reutiliza el campo para que PropertiesPanel muestre el #id sin cambios
    name: data?.Name?.value ?? `#${localId}`,
    globalId: data?._guid?.value ?? '',
    description: data?.Description?.value ?? '',
    type: data?._category?.value ?? '',
    propertySets,
    discipline: 'General',
    volume: null,
    area: null,
    objectType: data?.ObjectType?.value ?? '',
    tag: data?.Tag?.value ?? '',
    ownerHistory: null,
    materials: [],
    loadingDetails: false,
  };
}

export function useFragmentsSelection(
  rendererRef: React.RefObject<any>,
  storeRef: React.RefObject<any>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,

  suppressedRef?: React.RefObject<boolean>,
  suppressedRef2?: React.RefObject<boolean>
) {

  const selectedLocalIdsRef = useRef<number[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);

  const [popupVisible, setPopupVisible] = useState(false);
  const [popupScreenPos, setPopupScreenPos] = useState<ScreenPos | null>(null);
  const selectedPointRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const popupVisibleRef = useRef(false);
  useEffect(() => { popupVisibleRef.current = popupVisible; }, [popupVisible]);

  const busyRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let downX = 0, downY = 0;
    const onMouseDown = (e: MouseEvent) => { downX = e.clientX; downY = e.clientY; };

    const onClick = async (e: MouseEvent) => {
      if (suppressedRef?.current || suppressedRef2?.current) return; // otra herramienta (medición, cruz) está usando este click
      const model = storeRef.current?.fragmentsModel;
      const camera = rendererRef.current?.getCamera?.()?.camera;
      if (!model || !camera) return; // no hay modelo de Fragments cargado, no hace nada
      if (Math.hypot(e.clientX - downX, e.clientY - downY) >= 4) return; // arrastre de cámara, no click
      if (busyRef.current) return; // ya hay una selección resolviéndose, este click se ignora


      const mouse = new THREE.Vector2(e.clientX, e.clientY);

      busyRef.current = true;
      try {
        const result = await model.raycast({ camera, mouse, dom: canvas });

        if (selectedLocalIdsRef.current.length > 0) {
          await model.resetHighlight(selectedLocalIdsRef.current);
        }

        if (result) {
          await model.highlight([result.localId], HIGHLIGHT_MATERIAL);
          selectedLocalIdsRef.current = [result.localId];

          // DefinesOccurrence/ObjectTypeOf en false: sin esto, IsDefinedBy
          // con relations:true arrastra una referencia circular de vuelta
          // al propio elemento (confirmado en vivo — options confirmadas,
          // no un ajuste "por las dudas").
          const [data] = await model.getItemsData([result.localId], {
            attributesDefault: true,
            relations: {
              IsDefinedBy: { attributes: true, relations: true },
              DefinesOccurrence: { attributes: false, relations: false },
              ObjectTypeOf: { attributes: false, relations: false },
            },
          } as any);
          setSelectedEntity(itemDataToSelectedEntity(result.localId, data ?? {}));
          selectedPointRef.current = { x: result.point.x, y: result.point.y, z: result.point.z };
          setPopupVisible(true);
        } else {
          selectedLocalIdsRef.current = [];
          setSelectedEntity(null);
          selectedPointRef.current = null;
          setPopupVisible(false);
          setPopupScreenPos(null);
        }
        await storeRef.current?.fragments?.update(true);
      } catch (err) {
        console.warn('[useFragmentsSelection] error al seleccionar:', err);
      } finally {
        busyRef.current = false;
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('click', onClick);
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      canvas.removeEventListener('click', onClick);
    };
  }, [rendererRef, storeRef, canvasRef, suppressedRef, suppressedRef2]);

  // Resalta un GRUPO de ids a la vez (todos con el mismo
  // HIGHLIGHT_MATERIAL) y muestra en el popup las propiedades de
  // `primaryId` (uno de ellos, normalmente el primero). Hace falta esto
  // en vez de resaltar solo uno cuando el "elemento" clickeado en
  // realidad representa VARIOS elementos reales de IFC agrupados (ej.
  // una partida de acero: una fila de la tabla agrupa muchas barras de
  // refuerzo individuales) — resaltar solo la primera dejaba "el resto
  // adentro" sin marcar, pareciendo una selección incompleta.
  //
  // Para el botón "cerrar"/"deseleccionar" del PropertiesPanel — mismo
  // criterio que clearSelection() de useEntitySelection.ts, pero contra
  // el modelo de Fragments.
  const selectFragmentsGroupByLocalIds = useCallback(async (
    ids: number[],
    primaryId: number,
    worldPoint: { x: number; y: number; z: number }
  ) => {
    const model = storeRef.current?.fragmentsModel;
    if (!model || ids.length === 0) return;

    if (selectedLocalIdsRef.current.length > 0) {
      await model.resetHighlight(selectedLocalIdsRef.current);
    }
    await model.highlight(ids, HIGHLIGHT_MATERIAL);
    selectedLocalIdsRef.current = ids;

    const [data] = await model.getItemsData([primaryId], {
      attributesDefault: true,
      relations: {
        IsDefinedBy: { attributes: true, relations: true },
        DefinesOccurrence: { attributes: false, relations: false },
        ObjectTypeOf: { attributes: false, relations: false },
      },
    } as any);
    setSelectedEntity(itemDataToSelectedEntity(primaryId, data ?? {}));
    selectedPointRef.current = worldPoint;
    setPopupVisible(true);
    await storeRef.current?.fragments?.update(true);
  }, [storeRef]);

  // Caso puntual de arriba (un solo id) — reusado por el click normal
  // (arriba) y por "Buscar ID/GUID" (ver selectFragmentsByIdOrGuid más
  // abajo), donde el punto de mundo para el popup no sale de un
  // raycast sino del centro de la caja del elemento (getMergedBox),
  // porque no hubo ningún click real.
  const selectFragmentsEntityByLocalId = useCallback((
    localId: number,
    worldPoint: { x: number; y: number; z: number }
  ) => selectFragmentsGroupByLocalIds([localId], localId, worldPoint), [selectFragmentsGroupByLocalIds]);

  // "Buscar ID/GUID" para el camino Fragments — mismo alcance que
  // selectByIdOrGuid en useEntitySelection.ts: un número se interpreta
  // directo como localId (activeEntity.expressId reutiliza ese campo
  // para Fragments — ver el comentario en itemDataToSelectedEntity),
  // cualquier otra cosa se busca como GUID vía
  // model.getLocalIdsByGuids(...) — no hace falta armar un mapa propio
  // como el camino viejo (buildGuidMap), Fragments ya trae esa
  // resolución directa. También vuela la cámara hasta el elemento
  // (getMergedBox -> centro), cosa que el click normal no necesita
  // porque ya estás mirando para ese lado.
  //
  // Devuelve el localId (no un simple boolean) para que quien llama
  // (useIfcModel.ts) pueda además aislarlo (atenuar todo lo demás) —
  // necesario porque, a diferencia de un click normal, acá la cámara
  // puede terminar mirando el elemento buscado a través de otra
  // geometría que lo tape (paredes de otro ambiente, por ejemplo).
  const selectFragmentsByIdOrGuid = useCallback(async (rawInput: string): Promise<number | null> => {
    const input = rawInput.trim();
    if (!input) return null;
    const model = storeRef.current?.fragmentsModel;
    if (!model) return null;

    let localId: number | null = null;
    if (/^\d+$/.test(input)) {
      localId = parseInt(input, 10);
    } else {
      const [found] = await model.getLocalIdsByGuids([input]);
      localId = found ?? null;
    }
    if (localId === null) return null;

    try {
      const box = await model.getMergedBox([localId]);
      if (!box || box.isEmpty()) return null; // localId no existe en este modelo

      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.length() * 0.75, 1.5);
      // Vuelo animado (instant=false, el default) — pedido explícito del
      // usuario: nada de saltos directos acá, mismo criterio que el
      // click en un elemento puntual dentro de una partida (ver
      // selectFragmentsGroupInViewer en useIfcModel.ts). Aislar TODA la
      // partida de una sola vez sigue siendo un salto directo — eso no
      // cambió, es el criterio que ya traía la vieja flyToElements.
      rendererRef.current?.getCamera?.()?.flyToPoint?.(
        { x: center.x, y: center.y, z: center.z }, radius
      );

      await selectFragmentsEntityByLocalId(localId, { x: center.x, y: center.y, z: center.z });
      return localId;
    } catch (err) {
      console.warn('[useFragmentsSelection] error al buscar por ID/GUID:', err);
      return null;
    }
  }, [storeRef, rendererRef, selectFragmentsEntityByLocalId]);

  const clearFragmentsSelection = useCallback(async () => {
    const model = storeRef.current?.fragmentsModel;
    if (model && selectedLocalIdsRef.current.length > 0) {
      try {
        await model.resetHighlight(selectedLocalIdsRef.current);
        await storeRef.current?.fragments?.update(true);
      } catch (err) {
        console.warn('[useFragmentsSelection] error al deseleccionar:', err);
      }
    }
    selectedLocalIdsRef.current = [];
    setSelectedEntity(null);
    selectedPointRef.current = null;
    setPopupVisible(false);
    setPopupScreenPos(null);
  }, [storeRef]);

  const dismissPopup = useCallback(() => {
    setPopupVisible(false);
  }, []);

  // Igual que restorePopup en useEntitySelection.ts — vuelve a mostrar
  // el popup después de un dismissPopup (ver onZoom/onZoomEnd en
  // useIfcModel.ts, que esconden el popup mientras se mueve la cámara y
  // lo reaparecen al soltar), solo si sigue habiendo un punto
  // seleccionado (si mientras tanto se deseleccionó, no hay nada que
  // restaurar).
  const restorePopup = useCallback(() => {
    if (selectedPointRef.current) setPopupVisible(true);
  }, []);

  // Igual que reprojectPopup en useEntitySelection.ts — se llama desde
  // onFrame para que el popup siga al punto seleccionado mientras se
  // mueve la cámara.
  const reprojectFragmentsPopup = useCallback(() => {
    if (!popupVisibleRef.current || !selectedPointRef.current) return;
    const renderer = rendererRef.current;
    const camera = renderer?.getCamera?.();
    const canvas = canvasRef.current;
    if (!camera || !camera.projectToScreen || !canvas) return;

    const screen = camera.projectToScreen(selectedPointRef.current, canvas.width, canvas.height);
    if (screen) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      setPopupScreenPos({ x: screen.x / scaleX, y: screen.y / scaleY });
    }
  }, [rendererRef, canvasRef]);

  return {
    fragmentsSelectedEntity: selectedEntity,
    clearFragmentsSelection,
    selectFragmentsByIdOrGuid,
    // Exportados además del uso interno (click normal, Buscar ID/GUID)
    // — selectFragmentsGroupInViewer en useIfcModel.ts usa la versión
    // de grupo para resaltar TODOS los ids de un grupo de partida a la
    // vez (no solo el primero), mismo criterio que selectGroupInViewer
    // en useEntitySelection.ts (setSelection con la lista completa).
    selectFragmentsEntityByLocalId,
    selectFragmentsGroupByLocalIds,
    fragmentsPopupVisible: popupVisible,
    fragmentsPopupScreenPos: popupScreenPos,
    dismissFragmentsPopup: dismissPopup,
    restoreFragmentsPopup: restorePopup,
    reprojectFragmentsPopup,
  };
}
