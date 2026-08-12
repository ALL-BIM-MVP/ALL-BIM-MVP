import { useRef, useCallback } from 'react';
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
export type { ViewPreset } from '../types';

export function useIfcModel(fileBuffer: ArrayBuffer | null) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const storeRef = useRef<any>(null);
  const modelBoundsRef = useRef<ModelBounds | null>(null);

  const background = useViewerBackground(rendererRef);
  const walk = useWalkMode(rendererRef, canvasRef);
  // Snap magnético NATIVO del renderer (raycastSceneMagnetic) para medición
  // simple. La cruz usa su propio método del renderer (raycastFaceCross), que
  // reconstruye la cara plana y su borde real — ver ThreeSceneController.ts.
  const measure = useMeasureTool(rendererRef, canvasRef);
  const cross = useCrossTool(rendererRef, canvasRef);
  const section = useSectionPlane(rendererRef);

  const selection = useEntitySelection(rendererRef, storeRef);

  const onFrame = useCallback((dt: number) => {
    walk.updateWalkMovement(dt);
    measure.reprojectOnFrame();
    cross.reprojectOnFrame();
    selection.reprojectPopup();
  }, [walk, measure, cross, selection]);

  const loader = useModelLoader(
    fileBuffer,
    { canvasRef, containerRef, rendererRef, storeRef, modelBoundsRef },
    {
      onFrame,
      getClearColor: background.getClearColor,
      getSectionPlane: section.getSectionPlane,
    }
  );

  const visibility = useEntityVisibility(rendererRef, loader.typeGroups);

  const onPick = useCallback((expressId: number | null, point?: { x: number; y: number; z: number }) => {
    if (expressId !== null) selection.selectEntityById(expressId, point);
    else selection.clearSelection();
  }, [selection.selectEntityById, selection.clearSelection]);

  useCameraControls({
    ready: loader.ready,
    canvasRef,
    rendererRef,
    isWalkModeRef: walk.isWalkModeRef,
    walkStateRef: walk.walkStateRef,
    measureModeRef: measure.measureModeRef,
    // useCameraControls.ts sigue nombrando este parámetro "laserModeRef" — le
    // pasamos el ref del modo cruz. Renombrar ahí es opcional.
    laserModeRef: cross.crossModeRef,
    onPick,
    onZoom: selection.dismissPopup,
    onZoomEnd: selection.restorePopup,
    onMeasureMouseDown: measure.handleMeasureMouseDown,
    onMeasureMouseMove: measure.handleMeasureMouseMove,
    onMeasureMouseUp: measure.handleMeasureMouseUp,
    onMeasureHover: measure.updateHoverPreview,
    onLaserMouseDown: cross.handleCrossMouseDown,
    onLaserMouseMove: cross.handleCrossMouseMove,
    onLaserMouseUp: cross.handleCrossMouseUp,
    onLaserHover: cross.updateCrossHover,
  });

  return {
    canvasRef,
    containerRef,
    ...loader,
    ...selection,
    ...visibility,
    isWalkMode: walk.isWalkMode,
    toggleWalkMode: walk.toggleWalkMode,
    ...background,
    ...measure,
    ...cross,
    ...section,
  };
}