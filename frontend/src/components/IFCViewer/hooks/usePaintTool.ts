import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

interface Vec3 { x: number; y: number; z: number; }

export interface PaintStroke {
  id: string;
  points: Vec3[];
  color: string;
}

let strokeIdCounter = 0;
const nextStrokeId = () => `stroke_${++strokeIdCounter}`;

const MIN_POINT_DISTANCE = 0.01; // evita amontonar puntos casi idénticos al arrastrar despacio
// Mismo throttle que useFragmentsCrossTool.ts/useFragmentsMeasureTool.ts
// para no encadenar un raycast async por cada pixel de mousemove.
const PAINT_THROTTLE_MS = 32;

function dist3D(a: Vec3, b: Vec3) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function usePaintTool(
  rendererRef: React.RefObject<any>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,

  storeRef?: React.RefObject<any>
) {
  const [paintMode, setPaintMode] = useState(false);
  const [paintColor, setPaintColor] = useState('#ff3b30');
  const [strokes, setStrokes] = useState<PaintStroke[]>([]);

  const paintModeRef = useRef(false);
  const paintColorRef = useRef(paintColor);
  const drawingIdRef = useRef<string | null>(null);
  // Solo hace falta para el camino Fragments — mismo motivo que en
  // useFragmentsCrossTool.ts: no dejar dos raycasts async superpuestos
  // mientras se arrastra.
  const busyRef = useRef(false);
  const lastMoveAtRef = useRef(0);

  useEffect(() => { paintModeRef.current = paintMode; }, [paintMode]);
  useEffect(() => { paintColorRef.current = paintColor; }, [paintColor]);
  useEffect(() => { if (!paintMode) drawingIdRef.current = null; }, [paintMode]);

  const clientToCanvasCss = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, [canvasRef]);

  // Punto de mundo bajo el mouse — mismo bridge que armCutAt en
  // useElementCutTool.ts: contra un modelo de Fragments usa
  // model.raycast(...) directo (async, coordenadas de página crudas —
  // ver useFragmentsSelection.ts); contra el camino viejo usa
  // renderer.raycastSurfacePoint (síncrono, coordenadas CSS relativas
  // al canvas).
  const raycastPoint = useCallback(async (clientX: number, clientY: number): Promise<Vec3 | null> => {
    const model = storeRef?.current?.fragmentsModel;
    const renderer = rendererRef.current;

    if (model) {
      const cameraController = renderer?.getCamera?.();
      const camera = cameraController?.camera;
      const canvas = canvasRef.current;
      if (!camera || !canvas) return null;
      try {
        const mouse = new THREE.Vector2(clientX, clientY);
        const result = await model.raycast({ camera, mouse, dom: canvas });
        return result?.point ? { x: result.point.x, y: result.point.y, z: result.point.z } : null;
      } catch (err) {
        console.warn('[usePaintTool] error en raycast de Fragments:', err);
        return null;
      }
    }

    const css = clientToCanvasCss(clientX, clientY);
    if (!renderer?.raycastSurfacePoint || !css) return null;
    const hit = renderer.raycastSurfacePoint(css.x, css.y);
    return hit?.point ?? null;
  }, [rendererRef, canvasRef, storeRef, clientToCanvasCss]);

  const togglePaintMode = useCallback(() => setPaintMode((prev) => !prev), []);
  const exitPaintMode = useCallback(() => setPaintMode(false), []);

  const clearStrokes = useCallback(() => {
    rendererRef.current?.clearPaintStrokes?.();
    setStrokes([]);
    drawingIdRef.current = null;
  }, [rendererRef]);

  const removeStroke = useCallback((id: string) => {
    rendererRef.current?.removePaintStroke?.(id);
    setStrokes((prev) => prev.filter((s) => s.id !== id));
    if (drawingIdRef.current === id) drawingIdRef.current = null;
  }, [rendererRef]);

  const handlePaintMouseDown = useCallback((clientX: number, clientY: number): boolean => {
    if (!paintModeRef.current) return false;

    // Camino Fragments: el raycast es async, así que no se puede saber
    // en el momento si hay geometría debajo — se "reclama" el click
    // igual (mismo criterio que ya usan cruz de ejes/medición ahí:
    // mientras el modo pintar está armado, no se orbita, haya o no
    // impacto real) y el primer punto del trazo se agrega cuando
    // resuelve.
    if (storeRef?.current?.fragmentsModel) {
      const id = nextStrokeId();
      drawingIdRef.current = id;
      setStrokes((prev) => [...prev, { id, points: [], color: paintColorRef.current }]);
      raycastPoint(clientX, clientY).then((point) => {
        if (!point || drawingIdRef.current !== id) return; // trazo ya cerrado/descartado
        setStrokes((prev) => prev.map((s) => (s.id === id ? { ...s, points: [point] } : s)));
      });
      return true;
    }

    const renderer = rendererRef.current;
    const css = clientToCanvasCss(clientX, clientY);
    if (!renderer?.raycastSurfacePoint || !css) return false;

    const hit = renderer.raycastSurfacePoint(css.x, css.y);
    if (!hit) return false; // click en el vacío: dejamos que la cámara actúe (orbit/pan)

    const id = nextStrokeId();
    setStrokes((prev) => [...prev, { id, points: [hit.point], color: paintColorRef.current }]);
    drawingIdRef.current = id;
    return true;
  }, [rendererRef, storeRef, clientToCanvasCss, raycastPoint]);

  const handlePaintMouseMove = useCallback((clientX: number, clientY: number): boolean => {
    const id = drawingIdRef.current;
    if (!id) return false;

    if (storeRef?.current?.fragmentsModel) {
      const now = performance.now();
      if (now - lastMoveAtRef.current < PAINT_THROTTLE_MS) return true;
      lastMoveAtRef.current = now;
      if (busyRef.current) return true;

      busyRef.current = true;
      raycastPoint(clientX, clientY)
        .then((point) => {
          if (!point || drawingIdRef.current !== id) return;
          setStrokes((prev) => prev.map((s) => {
            if (s.id !== id) return s;
            const last = s.points[s.points.length - 1];
            if (last && dist3D(last, point) < MIN_POINT_DISTANCE) return s;
            const points = [...s.points, point];
            if (points.length >= 2) rendererRef.current?.setPaintStroke?.(id, points, s.color);
            return { ...s, points };
          }));
        })
        .finally(() => { busyRef.current = false; });
      return true;
    }

    const renderer = rendererRef.current;
    const css = clientToCanvasCss(clientX, clientY);
    if (!renderer?.raycastSurfacePoint || !css) return true;

    const hit = renderer.raycastSurfacePoint(css.x, css.y);
    if (!hit) return true; // seguimos "consumiendo" el drag aunque este tramo no tenga geometría debajo

    setStrokes((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      const last = s.points[s.points.length - 1];
      if (last && dist3D(last, hit.point) < MIN_POINT_DISTANCE) return s;
      const points = [...s.points, hit.point];
      renderer.setPaintStroke?.(id, points, s.color);
      return { ...s, points };
    }));
    return true;
  }, [rendererRef, storeRef, clientToCanvasCss, raycastPoint]);

  const handlePaintMouseUp = useCallback((): boolean => {
    const id = drawingIdRef.current;
    if (!id) return false;

    // Descarta trazos degenerados: un click sin arrastre real (menos de 2 puntos).
    setStrokes((prev) => {
      const stroke = prev.find((s) => s.id === id);
      if (stroke && stroke.points.length < 2) {
        rendererRef.current?.removePaintStroke?.(id);
        return prev.filter((s) => s.id !== id);
      }
      return prev;
    });
    drawingIdRef.current = null;
    return true;
  }, [rendererRef]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && paintModeRef.current) clearStrokes();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [clearStrokes]);

  return {
    paintMode, togglePaintMode, exitPaintMode,
    paintColor, setPaintColor,
    strokes, clearStrokes, removeStroke,
    handlePaintMouseDown, handlePaintMouseMove, handlePaintMouseUp,
  };
}
