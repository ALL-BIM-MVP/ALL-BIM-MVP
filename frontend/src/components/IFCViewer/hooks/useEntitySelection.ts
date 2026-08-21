import { useState, useCallback, useRef, useEffect } from 'react';
import type { SelectedEntity } from '../types';
import type { IfcWorkerClient } from '../workers/ifcWorkerClient';

function getDisciplineFromType(typeName: string): string {
  const t = typeName.toUpperCase();
  if (t.includes('BEAM') || t.includes('COLUMN') || t.includes('SLAB') || t.includes('FOOTING') || t.includes('PILE') || t.includes('REBAR') || t.includes('STRUCTURAL') || t.includes('RAMP')) return 'Estructuras';
  if (t.includes('PIPE') || t.includes('SANITARY') || t.includes('FLOWSEGMENT') || t.includes('VALVE') || t.includes('FLOWTERMINAL')) return 'Sanitarias';
  if (t.includes('CABLE') || t.includes('ELECTRIC') || t.includes('OUTLET') || t.includes('LIGHT') || t.includes('SWITCHING')) return 'Eléctricas';
  if (t.includes('DUCT') || t.includes('AIRTERMINAL') || t.includes('FAN') || t.includes('CHILLER') || t.includes('BOILER')) return 'Mecánicas';
  if (t.includes('WALL') || t.includes('DOOR') || t.includes('WINDOW') || t.includes('ROOF') || t.includes('STAIR') || t.includes('RAILING') || t.includes('COVERING') || t.includes('FURNISHING') || t.includes('CURTAIN')) return 'Arquitectura';
  return 'General';
}

interface ScreenPos { x: number; y: number; }

export function useEntitySelection(
  rendererRef: React.RefObject<any>,
  storeRef: React.RefObject<any>
) {
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupScreenPos, setPopupScreenPos] = useState<ScreenPos | null>(null);

  const selectedPointRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const popupVisibleRef = useRef(false);
  useEffect(() => { popupVisibleRef.current = popupVisible; }, [popupVisible]);

  // Token de la última consulta pedida — si llegan dos clicks seguidos
  // (el usuario cambia de elemento antes de que responda el worker por
  // el anterior), la respuesta vieja no debe pisar la selección nueva.
  const requestSeqRef = useRef(0);

  // Trae propiedades/materiales/historial de UN elemento y muestra el
  // popup — NO toca la selección visual en el renderer (eso lo decide
  // quien llama: selectEntityById marca solo este; selectGroupInViewer
  // marca varios y usa esto solo para la ficha del primero). Separado
  // de selectEntityById para poder reusar la parte cara (consulta al
  // worker) sin pisar una selección múltiple ya aplicada.
  //
  // IMPORTANTE: la cámara/marcador/popup se muestran DE INMEDIATO, ANTES
  // de esperar al worker — solo con placeholder "Cargando..." en los
  // datos. Antes esto se hacía todo DESPUÉS del await a getEntityDetails,
  // así que durante el viaje de ida y vuelta al worker no pasaba nada en
  // pantalla y el click se sentía "roto" (no confirma nada hasta que
  // tarda en llegar la respuesta). Ahora el feedback visual es
  // instantáneo, y los datos completos (propiedades/materiales/historial)
  // se completan cuando llega la respuesta.
  //
  // Toda la lectura pesada de web-ifc (GetLine, getPropertySets,
  // getMaterialsProperties, OwnerHistory) vive en el worker
  // (workers/ifcWorker.ts, comando 'getEntityDetails') y se resuelve en
  // UN SOLO viaje de mensaje — evita ida y vuelta por cada propiedad
  // suelta.
  const showEntityDetails = useCallback(async (expressId: number, point?: { x: number; y: number; z: number }) => {
    const store = storeRef.current as { client?: IfcWorkerClient } | null;
    const renderer = rendererRef.current;
    if (!store?.client || !renderer) return;

    const mySeq = ++requestSeqRef.current;

    // --- 1) Feedback inmediato, sin esperar nada del worker ---
    let anchorPoint = point;
    if (!anchorPoint) {
      // Sin punto de click (búsqueda por ID, o click desde la tabla de
      // metrados): volamos la cámara, mostramos el marcador láser (por si
      // queda tapado por un vecino) y usamos el centro del elemento como
      // ancla del popup. Todo esto es geometría local (renderer), no
      // necesita al worker — por eso puede pasar YA.
      renderer.flyToElement?.(expressId);
      renderer.showElementMarker?.(expressId);
      anchorPoint = renderer.getElementCenter?.(expressId) ?? undefined;
    } else {
      // Selección por click directo en el 3D: ya estás viendo el
      // elemento, no hace falta marcador — y si quedó uno de una
      // búsqueda anterior, lo limpiamos.
      renderer.clearElementMarker?.();
    }
    renderer.requestRender?.();

    selectedPointRef.current = anchorPoint ?? null;

    const stats = renderer.getElementStats?.(expressId);
    setSelectedEntity({
      expressId,
      name: `#${expressId}`,
      globalId: '',
      description: '',
      objectType: '',
      tag: '',
      type: '',
      propertySets: [],
      discipline: 'General',
      volume: stats ? stats.volume : null,
      area: stats ? stats.area : null,
      ownerHistory: null,
      materials: [],
      loadingDetails: true, // <- el popup debe mostrar un spinner/skeleton mientras esto sea true
    } as SelectedEntity);
    setPopupVisible(true);

    // --- 2) Completar con los datos reales cuando responda el worker ---
    try {
      const result = await store.client.getEntityDetails(expressId);
      if (requestSeqRef.current !== mySeq) return; // llegó tarde, ya hay otra selección activa

      setSelectedEntity({
        expressId,
        name: result.name,
        globalId: result.globalId,
        description: result.description,
        objectType: result.objectType,
        tag: result.tag,
        type: result.type,
        propertySets: result.propertySets,
        discipline: getDisciplineFromType(result.type),
        volume: stats ? stats.volume : null,
        area: stats ? stats.area : null,
        ownerHistory: result.ownerHistory,
        materials: result.materials,
        loadingDetails: false,
      } as SelectedEntity);
    } catch (err) {
      if (requestSeqRef.current !== mySeq) return;
      console.error('Error al leer propiedades del elemento:', err);
      // Dejamos el popup abierto con lo mínimo (nombre/volumen) en vez de
      // hacerlo desaparecer — mejor mostrar algo incompleto que nada.
      setSelectedEntity((prev) => (prev && prev.expressId === expressId ? { ...prev, loadingDetails: false } : prev));
    }
  }, [rendererRef, storeRef]);

  // Selección de UN elemento (click directo en el 3D, o resultado de
  // búsqueda): marca la selección visual Y muestra su ficha completa.
  const selectEntityById = useCallback(async (expressId: number, point?: { x: number; y: number; z: number }) => {
    rendererRef.current?.setSelection?.([expressId]);
    await showEntityDetails(expressId, point);
  }, [rendererRef, showEntityDetails]);

  // NUEVO: selección de un GRUPO (click en una fila de la tabla de
  // metrados) — resalta TODOS los elementos del grupo en el visor, y
  // muestra la ficha de propiedades del PRIMERO (mostrar la ficha de
  // cada uno a la vez no tendría sentido en un solo popup). Es el
  // comportamiento "normal" de click, aplicado a varios elementos:
  // selección + popup, sin ocultar el resto del modelo.
  const selectGroupInViewer = useCallback(async (expressIds: number[]) => {
    if (expressIds.length === 0) return;
    rendererRef.current?.setSelection?.(expressIds);
    // showEntityDetails no vuelve a tocar la selección — así los otros
    // elementos del grupo se quedan resaltados también, no solo el
    // primero que aparece en el popup.
    await showEntityDetails(expressIds[0]);
  }, [rendererRef, showEntityDetails]);

  const clearSelection = useCallback(() => {
    setSelectedEntity(null);
    setPopupVisible(false);
    setPopupScreenPos(null);
    selectedPointRef.current = null;
    rendererRef.current?.setSelection?.([]);
    rendererRef.current?.clearElementMarker?.();
    rendererRef.current?.requestRender?.();
  }, [rendererRef]);

  const dismissPopup = useCallback(() => {
    setPopupVisible(false);
  }, []);

  const restorePopup = useCallback(() => {
    if (selectedPointRef.current) setPopupVisible(true);
  }, []);

  const reprojectPopup = useCallback(() => {
    if (!popupVisibleRef.current || !selectedPointRef.current) return;
    const renderer = rendererRef.current;
    const camera = renderer?.getCamera?.();
    if (!camera || !camera.projectToScreen) return;

    const canvas = renderer['canvas'];
    if (!canvas) return;

    const screen = camera.projectToScreen(selectedPointRef.current, canvas.width, canvas.height);
    if (screen) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      setPopupScreenPos({ x: screen.x / scaleX, y: screen.y / scaleY });
    }
  }, [rendererRef]);

  // Mapa GlobalId -> expressId, se construye una sola vez por modelo y se
  // cachea. Antes se comparaba por modelID (número expuesto por web-ifc);
  // ahora que api/modelID viven dentro del worker y no se exponen acá,
  // se compara por IDENTIDAD del client (useModelLoader crea un
  // IfcWorkerClient nuevo por cada carga de modelo, así que comparar la
  // referencia es equivalente y no requiere tocar el worker).
  const guidMapRef = useRef<Map<string, number> | null>(null);
  const guidMapClientRef = useRef<IfcWorkerClient | null>(null);

  const selectByIdOrGuid = useCallback(async (rawInput: string): Promise<boolean> => {
    const input = rawInput.trim();
    if (!input) return false;

    const store = storeRef.current as { client?: IfcWorkerClient } | null;
    if (!store?.client) return false;
    const { client } = store;

    // Caso 1: expressId numérico
    if (/^\d+$/.test(input)) {
      const expressId = parseInt(input, 10);
      const exists = await client.checkLineExists(expressId);
      if (!exists) return false;
      await selectEntityById(expressId);
      return true;
    }

    // Caso 2: GlobalId (GUID IFC, string base64 de ~22 caracteres)
    if (guidMapClientRef.current !== client || !guidMapRef.current) {
      guidMapRef.current = await client.buildGuidMap();
      guidMapClientRef.current = client;
    }
    const expressId = guidMapRef.current.get(input);
    if (expressId === undefined) return false;

    await selectEntityById(expressId);
    return true;
  }, [selectEntityById, storeRef]);

  return {
    selectedEntity,
    selectEntityById,
    selectGroupInViewer,
    selectByIdOrGuid,
    clearSelection,
    popupVisible,
    popupScreenPos,
    dismissPopup,
    restorePopup,
    reprojectPopup,
  };
}