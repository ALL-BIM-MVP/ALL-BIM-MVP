import { useState, useCallback, useRef, useEffect } from 'react';
import * as WebIFC from 'web-ifc';
import type { SelectedEntity } from '../types';
import { getIfcTypeName } from '../utils/ifcTypeNames';

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

  const selectEntityById = useCallback(async (expressId: number, point?: { x: number; y: number; z: number }) => {
    const store = storeRef.current;
    const renderer = rendererRef.current;
    if (!store?.api || store.modelID === undefined || !renderer) return;

    const { api, modelID } = store;

    try {
      const line = api.GetLine(modelID, expressId, true);

      let typeName = '';
      try {
        const typeCode = api.GetLineType(modelID, expressId);
        typeName = getIfcTypeName(api, typeCode);
      } catch { /* deja typeName vacío si falla */ }

      let propertySets: { name: string; properties: { name: string; value: any }[] }[] = [];
      try {
        const psetLines = await api.properties?.getPropertySets?.(modelID, expressId, true) ?? [];
        propertySets = psetLines.map((pset: any) => {
          const psetName = pset.Name?.value ?? 'PropertySet';
          const props = (pset.HasProperties || []).map((propRef: any) => {
            try {
              let propLine: any = propRef;
              if (propRef?.Name === undefined && propRef?.NominalValue === undefined) {
                const propId = typeof propRef === 'number' ? propRef : propRef?.value;
                if (typeof propId === 'number') propLine = api.GetLine(modelID, propId);
              }
              return {
                name: propLine.Name?.value ?? 'Propiedad',
                value: propLine.NominalValue?.value ?? propLine.NominalValue ?? '',
              };
            } catch {
              return { name: 'Propiedad', value: '(no disponible)' };
            }
          });
          return { name: psetName, properties: props };
        });
      } catch (psetErr) {
        console.warn('No se pudieron leer property sets:', psetErr);
      }

      // Historial de creación — mejor esfuerzo, no rompe si falla
      let ownerHistory: { creationDate: string; owningUser: string; owningApplication: string } | null = null;
      try {
        const ownerHistoryRef = line.OwnerHistory;
        const ownerHistoryId = ownerHistoryRef?.value ?? ownerHistoryRef;
        if (typeof ownerHistoryId === 'number') {
          const ohLine = api.GetLine(modelID, ownerHistoryId, true);
          const creationTimestamp = ohLine.CreationDate?.value;
          const creationDate = creationTimestamp ? new Date(creationTimestamp * 1000).toLocaleDateString() : '';

          let owningUser = '';
          try {
            const userRef = ohLine.OwningUser?.value ?? ohLine.OwningUser;
            if (typeof userRef === 'number') {
              const userLine = api.GetLine(modelID, userRef, true);
              const personRef = userLine.ThePerson?.value ?? userLine.ThePerson;
              if (typeof personRef === 'number') {
                const personLine = api.GetLine(modelID, personRef, true);
                owningUser = [personLine.GivenName?.value, personLine.FamilyName?.value].filter(Boolean).join(' ');
              }
            }
          } catch { /* usuario no disponible */ }

          let owningApplication = '';
          try {
            const appRef = ohLine.OwningApplication?.value ?? ohLine.OwningApplication;
            if (typeof appRef === 'number') {
              const appLine = api.GetLine(modelID, appRef, true);
              owningApplication = appLine.ApplicationFullName?.value ?? '';
            }
          } catch { /* aplicación no disponible */ }

          ownerHistory = { creationDate, owningUser, owningApplication };
        }
      } catch { /* historial no disponible para este elemento */ }

      // Material — mejor esfuerzo, requiere método específico de web-ifc
      let materials: string[] = [];
      try {
        const matResult = await api.properties?.getMaterialsProperties?.(modelID, expressId, true);
        const matData = matResult ?? [];
        materials = matData
          .map((m: any) => m.Name?.value ?? m.Material?.Name?.value)
          .filter(Boolean);
      } catch { /* material no disponible para este elemento */ }

      const stats = renderer.getElementStats?.(expressId);

      setSelectedEntity({
        expressId,
        name: line.Name?.value || `#${expressId}`,
        globalId: line.GlobalId?.value || '',
        description: line.Description?.value || '',
        objectType: line.ObjectType?.value || '',
        tag: line.Tag?.value || '',
        type: typeName,
        propertySets,
        discipline: getDisciplineFromType(typeName),
        volume: stats ? stats.volume : null,
        area: stats ? stats.area : null,
        ownerHistory,
        materials,
      } as SelectedEntity);

      renderer.setSelection?.([expressId]);

      let anchorPoint = point;
      if (!anchorPoint) {
        // Selección por búsqueda/ID: no hay punto de click. Volamos la
        // cámara, mostramos el marcador láser (por si queda tapado por un
        // vecino) y usamos el centro del elemento como ancla del popup.
        renderer.flyToElement?.(expressId);
        renderer.showElementMarker?.(expressId);
        anchorPoint = renderer.getElementCenter?.(expressId) ?? undefined;
      } else {
        // Selección por click: ya estás viendo el elemento directamente,
        // no hace falta marcador — y si quedó uno de una búsqueda anterior,
        // lo limpiamos.
        renderer.clearElementMarker?.();
      }

      renderer.requestRender?.();

      selectedPointRef.current = anchorPoint ?? null;
      setPopupVisible(true);
    } catch (err) {
      console.error('Error al leer propiedades del elemento:', err);
    }
  }, [rendererRef, storeRef]);

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

  // Mapa GlobalId -> expressId, se construye una sola vez por modelo y se cachea
  const guidMapRef = useRef<Map<string, number> | null>(null);
  const guidMapModelIdRef = useRef<number | null>(null);

  function buildGuidMap(api: any, modelID: number): Map<string, number> {
    const map = new Map<string, number>();
    const maxId = api.GetMaxExpressID(modelID);
    for (let id = 1; id <= maxId; id++) {
      try {
        const line = api.GetLine(modelID, id);
        const guid = line?.GlobalId?.value;
        if (guid) map.set(guid, id);
      } catch {
        // id sin línea válida, se salta
      }
    }
    return map;
  }

  const selectByIdOrGuid = useCallback(async (rawInput: string): Promise<boolean> => {
    const input = rawInput.trim();
    if (!input) return false;

    const store = storeRef.current;
    if (!store?.api || store.modelID === undefined) return false;
    const { api, modelID } = store;

    // Caso 1: expressId numérico
    if (/^\d+$/.test(input)) {
      const expressId = parseInt(input, 10);
      try {
        api.GetLine(modelID, expressId); // valida que exista
      } catch {
        return false;
      }
      await selectEntityById(expressId);
      return true;
    }

    // Caso 2: GlobalId (GUID IFC, string base64 de ~22 caracteres)
    if (guidMapModelIdRef.current !== modelID || !guidMapRef.current) {
      guidMapRef.current = buildGuidMap(api, modelID);
      guidMapModelIdRef.current = modelID;
    }
    const expressId = guidMapRef.current.get(input);
    if (expressId === undefined) return false;

    await selectEntityById(expressId);
    return true;
  }, [selectEntityById, storeRef]);

  return {
    selectedEntity,
    selectEntityById,
    selectByIdOrGuid,
    clearSelection,
    popupVisible,
    popupScreenPos,
    dismissPopup,
    restorePopup,
    reprojectPopup,
  };
}