import { useRef, useCallback, useEffect } from 'react';
import type { ModelBounds } from '../types';
import { useModelLoader } from './useModelLoader';
import { useEntitySelection } from './useEntitySelection';
import { useEntityVisibility } from './useEntityVisibility';
import { useWalkMode } from './useWalkMode';
import { useMeasureTool } from './useMeasureTool';
import { useCrossTool } from './useCrossTool';
import { useViewerBackground } from './useViewerBackground';
import { useCameraControls } from './useCameraControls';
import { useSectionPlane } from './useSectionPlane';
import { useElementCutTool } from './useElementCutTool';
import { usePaintTool } from './usePaintTool';
export type { ViewPreset } from '../types';

export function useIfcModel(fileBuffer: ArrayBuffer | null, panelOffsetPx: number = 0, isActive: boolean = true) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const storeRef = useRef<any>(null);
  const modelBoundsRef = useRef<ModelBounds | null>(null);

  const background = useViewerBackground(rendererRef);
  const walk = useWalkMode(rendererRef, canvasRef);
  const measure = useMeasureTool(rendererRef, canvasRef);
  const cross = useCrossTool(rendererRef, canvasRef);
  const section = useSectionPlane(rendererRef);
  const elementCut = useElementCutTool(rendererRef, canvasRef);

  const selection = useEntitySelection(rendererRef, storeRef);
  const paint = usePaintTool(rendererRef, canvasRef);

  const onFrame = useCallback((dt: number) => {
    walk.updateWalkMovement(dt);
    measure.reprojectOnFrame();
    cross.reprojectOnFrame();
    elementCut.reprojectOnFrame();
    selection.reprojectPopup();
  }, [walk, measure, cross, elementCut, selection]);

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
    }
  );

  const visibility = useEntityVisibility(rendererRef, loader.typeGroups, loader.levelGroups, panelOffsetPx);

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
      cross.clearCross();
      paint.clearStrokes();
      selection.clearSelection();
    }
  }, [walk, measure, cross, paint, selection]);

  const onPick = useCallback((expressId: number | null, point?: { x: number; y: number; z: number }) => {
    if (expressId !== null) selection.selectEntityById(expressId, point);
    else selection.clearSelection();
  }, [selection.selectEntityById, selection.clearSelection]);

  const onZoom = useCallback(() => {
    if (elementCut.cutArmed) return;
    selection.dismissPopup();
  }, [elementCut.cutArmed, selection.dismissPopup]);

  const onZoomEnd = useCallback(() => {
    if (elementCut.cutArmed) return;
    selection.restorePopup();
  }, [elementCut.cutArmed, selection.restorePopup]);

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
    ...visibility,
    isWalkMode: walk.isWalkMode,
    toggleWalkMode: walk.toggleWalkMode,
    isWalkPaused: walk.isWalkPaused,
    toggleWalkPause,
    ...background,
    ...measure,
    ...cross,
    ...section,
    ...elementCut,
    ...paint,
  };
}