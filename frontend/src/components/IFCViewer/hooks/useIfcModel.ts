import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import type { ModelBounds } from '../types';
import { useModelLoader } from './useModelLoader';
import { useEntitySelection } from './useEntitySelection';
import { useEntityVisibility } from './useEntityVisibility';
import { useFragmentsEntityVisibility } from './useFragmentsEntityVisibility';
import { useWalkMode } from './useWalkMode';
import { useMeasureTool } from './useMeasureTool';
import { useCrossTool } from './useCrossTool';
import { useViewerBackground } from './useViewerBackground';
import { useCameraControls } from './useCameraControls';
import { useSectionPlane } from './useSectionPlane';
import { useElementCutTool } from './useElementCutTool';
import { usePaintTool } from './usePaintTool';
import { useFragmentsSelection } from './useFragmentsSelection';
import { useFragmentsMeasureTool } from './useFragmentsMeasureTool';
import { useFragmentsCrossTool } from './useFragmentsCrossTool';
export type { ViewPreset } from '../types';

export function useIfcModel(
  fileBuffer: ArrayBuffer | null,
  panelOffsetPx: number = 0,
  isActive: boolean = true,
  // Fase 1 real — ver el comentario largo en useModelLoader.ts.
  fragmentsBuffer: ArrayBuffer | null = null
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const storeRef = useRef<any>(null);
  const modelBoundsRef = useRef<ModelBounds | null>(null);

  const background = useViewerBackground(rendererRef);
  const walk = useWalkMode(rendererRef, canvasRef, storeRef);
  const measure = useMeasureTool(rendererRef, canvasRef);
  const cross = useCrossTool(rendererRef, canvasRef);
  const section = useSectionPlane(rendererRef);
  const elementCut = useElementCutTool(rendererRef, canvasRef, storeRef);

  const selection = useEntitySelection(rendererRef, storeRef);
  const paint = usePaintTool(rendererRef, canvasRef, storeRef);
  const fragmentsMeasure = useFragmentsMeasureTool(rendererRef, storeRef, canvasRef);
  const fragmentsCross = useFragmentsCrossTool(rendererRef, storeRef, canvasRef);
  const fragmentsSelection = useFragmentsSelection(
    rendererRef, storeRef, canvasRef,
    // fragmentsMeasureBusyRef (no fragmentsMeasureModeRef): pedido
    // explícito del usuario — apenas se completa una medición (ya no
    // está armada) un click normal tiene que poder seleccionar, sin
    // salir del modo medición para eso.
    fragmentsMeasure.fragmentsMeasureBusyRef, fragmentsCross.fragmentsCrossModeRef
  );

  const onFrame = useCallback((dt: number) => {
    walk.updateWalkMovement(dt);
    measure.reprojectOnFrame();
    fragmentsMeasure.reprojectFragmentsMeasureOnFrame();
    cross.reprojectOnFrame();
    fragmentsCross.reprojectFragmentsCrossOnFrame();
    elementCut.reprojectOnFrame();
    selection.reprojectPopup();
    fragmentsSelection.reprojectFragmentsPopup();
  }, [walk, measure, fragmentsMeasure, cross, fragmentsCross, elementCut, selection, fragmentsSelection]);

  const getCombinedSectionPlane = useCallback(() => {
    return elementCut.getSectionPlane() ?? section.getSectionPlane();
  }, [elementCut, section]);

  const loader = useModelLoader(
    fileBuffer,
    { canvasRef, containerRef, rendererRef, storeRef, modelBoundsRef },
    {
      onFrame,
      getClearColor: background.getClearColor,
      getSectionPlane: getCombinedSectionPlane,
      isActive,
    },
    fragmentsBuffer
  );

  const visibility = useEntityVisibility(rendererRef, loader.typeGroups, loader.levelGroups, panelOffsetPx);
  const fragmentsVisibility = useFragmentsEntityVisibility(storeRef, loader.ready);


  const selectFragmentsByIdOrGuidAndIsolate = useCallback(async (rawInput: string): Promise<boolean> => {
    const localId = await fragmentsSelection.selectFragmentsByIdOrGuid(rawInput);
    if (localId !== null) fragmentsVisibility.isolateFragmentsElementById(localId);
    return localId !== null;
  }, [fragmentsSelection, fragmentsVisibility]);

  
  const flyToFragmentsElements = useCallback(async (ids: number[], instant = true) => {
    const model = storeRef.current?.fragmentsModel;
    if (!model || ids.length === 0) return;
    try {
      const box = await model.getMergedBox(ids);
      if (!box || box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = instant
        ? Math.max(size.length() * 0.75, 1.5) * 1.2
        : Math.max(size.length() * 0.5, 0.8);
      rendererRef.current?.getCamera?.()?.flyToPoint?.(
        { x: center.x, y: center.y, z: center.z }, radius, instant
      );
    } catch (err) {
      console.warn('[useIfcModel] error al volar hacia los elementos de Fragments:', err);
    }
  }, [storeRef, rendererRef]);


  const isolateFragmentsElementsByIdsAndFly = useCallback((ids: number[]) => {
    fragmentsVisibility.isolateFragmentsElementsByIds(ids);
  }, [fragmentsVisibility]);


  const selectFragmentsGroupInViewer = useCallback(async (ids: number[]) => {
    if (ids.length === 0) return;
    if (fragmentsVisibility.fragmentsSelectedTypes.size > 0) fragmentsVisibility.clearFragmentsSelectedTypes();
    if (fragmentsVisibility.fragmentsSelectedLevels.size > 0) fragmentsVisibility.clearFragmentsSelectedLevels();
    const model = storeRef.current?.fragmentsModel;
    let point = { x: 0, y: 0, z: 0 };
    try {
      const box = await model?.getMergedBox(ids);
      if (box && !box.isEmpty()) {
        const center = box.getCenter(new THREE.Vector3());
        point = { x: center.x, y: center.y, z: center.z };
      }
    } catch (err) {
      console.warn('[useIfcModel] error al calcular el punto del grupo de Fragments:', err);
    }
    await fragmentsSelection.selectFragmentsGroupByLocalIds(ids, ids[0], point);
    await flyToFragmentsElements(ids, false);
  }, [fragmentsSelection, storeRef, flyToFragmentsElements, fragmentsVisibility]);

  useEffect(() => {
    if (!rendererRef.current) return;
    const ids = new Set<number>();
    for (const g of loader.typeGroups) {
      const t = g.type.toUpperCase();
      if (
        t.includes('DOOR') || t.includes('WINDOW') ||
        t.includes('PUERTA') || t.includes('VENTANA')
      ) {
        g.ids.forEach((id) => ids.add(id));
      }
    }
    rendererRef.current.setWalkThroughEntities?.(ids);
  }, [loader.typeGroups]);

  const toggleWalkPause = useCallback(() => {
    const wasPaused = walk.isWalkPaused;
    walk.toggleWalkPause();
    if (wasPaused) {
      measure.clearMeasurement();
      fragmentsMeasure.clearFragmentsMeasurement();
      cross.clearCross();
      fragmentsCross.clearFragmentsCross();
      paint.clearStrokes();
      selection.clearSelection();
    }
  }, [walk, measure, fragmentsMeasure, cross, fragmentsCross, paint, selection]);

  const onPick = useCallback((expressId: number | null, point?: { x: number; y: number; z: number }) => {
    if (expressId !== null) selection.selectEntityById(expressId, point);
    else selection.clearSelection();
  }, [selection.selectEntityById, selection.clearSelection]);


  const onZoom = useCallback(() => {
    if (elementCut.cutArmed) return;
    selection.dismissPopup();
    fragmentsSelection.dismissFragmentsPopup();
  }, [elementCut.cutArmed, selection.dismissPopup, fragmentsSelection.dismissFragmentsPopup]);

  const onZoomEnd = useCallback(() => {
    if (elementCut.cutArmed) return;
    selection.restorePopup();
    fragmentsSelection.restoreFragmentsPopup();
  }, [elementCut.cutArmed, selection.restorePopup, fragmentsSelection.restoreFragmentsPopup]);

  useCameraControls({
    ready: loader.ready,
    canvasRef,
    rendererRef,
    isWalkModeRef: walk.isWalkModeRef,
    walkStateRef: walk.walkStateRef,
    measureModeRef: measure.measureModeRef,
    onPaintMouseDown: paint.handlePaintMouseDown,
    onPaintMouseMove: paint.handlePaintMouseMove,
    onPaintMouseUp: paint.handlePaintMouseUp,
    laserModeRef: cross.crossModeRef,
    onPick,
    onZoom,
    onZoomEnd,
    onMeasureMouseDown: measure.handleMeasureMouseDown,
    onMeasureMouseMove: measure.handleMeasureMouseMove,
    onMeasureMouseUp: measure.handleMeasureMouseUp,
    onMeasureHover: measure.updateHoverPreview,
    onLaserMouseDown: cross.handleCrossMouseDown,
    onLaserMouseMove: cross.handleCrossMouseMove,
    onLaserMouseUp: cross.handleCrossMouseUp,
    onLaserHover: cross.updateCrossHover,
    onCutMouseDown: elementCut.handleCutMouseDown,
    onCutMouseMove: elementCut.handleCutMouseMove,
    onCutMouseUp: elementCut.handleCutMouseUp,
  });

  return {
    canvasRef,
    containerRef,
    ...loader,
    ...selection,
    ...fragmentsSelection,
    ...visibility,
    ...fragmentsVisibility,
    // Pisa el selectFragmentsByIdOrGuid crudo de fragmentsSelection: hacia
    // afuera de este hook solo se expone la versión que también aísla.
    selectFragmentsByIdOrGuid: selectFragmentsByIdOrGuidAndIsolate,
    // Ídem: pisa el isolateFragmentsElementsByIds crudo de
    // fragmentsVisibility con la versión que también vuela la cámara.
    isolateFragmentsElementsByIds: isolateFragmentsElementsByIdsAndFly,
    selectFragmentsGroupInViewer,
    isWalkMode: walk.isWalkMode,
    toggleWalkMode: walk.toggleWalkMode,
    isWalkPaused: walk.isWalkPaused,
    toggleWalkPause,
    ...background,
    ...measure,
    ...fragmentsMeasure,
    ...cross,
    ...fragmentsCross,
    ...section,
    ...elementCut,
    ...paint,
  };
}