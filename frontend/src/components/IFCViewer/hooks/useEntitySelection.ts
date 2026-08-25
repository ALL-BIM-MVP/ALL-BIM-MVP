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

  const requestSeqRef = useRef(0);

  const showEntityDetails = useCallback(async (expressId: number, point?: { x: number; y: number; z: number }) => {
    const store = storeRef.current as { client?: IfcWorkerClient } | null;
    const renderer = rendererRef.current;
    if (!store?.client || !renderer) return;

    const mySeq = ++requestSeqRef.current;

    let anchorPoint = point;
    if (!anchorPoint) {
      renderer.flyToElement?.(expressId);
      renderer.showElementMarker?.(expressId);
      anchorPoint = renderer.getElementCenter?.(expressId) ?? undefined;
    } else {
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
      loadingDetails: true,
    } as SelectedEntity);
    setPopupVisible(true);

    try {
      const result = await store.client.getEntityDetails(expressId);
      if (requestSeqRef.current !== mySeq) return;

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
      setSelectedEntity((prev) => (prev && prev.expressId === expressId ? { ...prev, loadingDetails: false } : prev));
    }
  }, [rendererRef, storeRef]);

  const selectEntityById = useCallback(async (expressId: number, point?: { x: number; y: number; z: number }) => {
    rendererRef.current?.setSelection?.([expressId]);
    rendererRef.current?.clearGroupDimming?.();
    await showEntityDetails(expressId, point);
  }, [rendererRef, showEntityDetails]);

  
  const selectGroupInViewer = useCallback(async (expressIds: number[]) => {
    if (expressIds.length === 0) return;
  
    try {
      rendererRef.current?.setGroupSelectionWithDimming?.(expressIds);
    } catch (err) {
      console.error('No se pudo atenuar el resto del modelo, se aplica selección simple:', err);
      rendererRef.current?.setSelection?.(expressIds);
    }
    
    await showEntityDetails(expressIds[0]);
  }, [rendererRef, showEntityDetails]);

  const clearSelection = useCallback(() => {
    setSelectedEntity(null);
    setPopupVisible(false);
    setPopupScreenPos(null);
    selectedPointRef.current = null;
    rendererRef.current?.setSelection?.([]);
    rendererRef.current?.clearGroupDimming?.();
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

  const guidMapRef = useRef<Map<string, number> | null>(null);
  const guidMapClientRef = useRef<IfcWorkerClient | null>(null);

  const selectByIdOrGuid = useCallback(async (rawInput: string): Promise<boolean> => {
    const input = rawInput.trim();
    if (!input) return false;

    const store = storeRef.current as { client?: IfcWorkerClient } | null;
    if (!store?.client) return false;
    const { client } = store;

    if (/^\d+$/.test(input)) {
      const expressId = parseInt(input, 10);
      const exists = await client.checkLineExists(expressId);
      if (!exists) return false;
      await selectEntityById(expressId);
      return true;
    }

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