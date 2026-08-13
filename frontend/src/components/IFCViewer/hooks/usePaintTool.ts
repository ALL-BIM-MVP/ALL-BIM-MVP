import { useState, useRef, useEffect, useCallback } from 'react';

interface Vec3 { x: number; y: number; z: number; }

export interface PaintStroke {
  id: string;
  points: Vec3[];
  color: string;
}

let strokeIdCounter = 0;
const nextStrokeId = () => `stroke_${++strokeIdCounter}`;

const MIN_POINT_DISTANCE = 0.01; // evita amontonar puntos casi idénticos al arrastrar despacio

function dist3D(a: Vec3, b: Vec3) {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function usePaintTool(
  rendererRef: React.RefObject<any>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const [paintMode, setPaintMode] = useState(false);
  const [paintColor, setPaintColor] = useState('#ff3b30');
  const [strokes, setStrokes] = useState<PaintStroke[]>([]);

  const paintModeRef = useRef(false);
  const paintColorRef = useRef(paintColor);
  const drawingIdRef = useRef<string | null>(null);

  useEffect(() => { paintModeRef.current = paintMode; }, [paintMode]);
  useEffect(() => { paintColorRef.current = paintColor; }, [paintColor]);
  useEffect(() => { if (!paintMode) drawingIdRef.current = null; }, [paintMode]);

  const clientToCanvasCss = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, [canvasRef]);

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
    const renderer = rendererRef.current;
    const css = clientToCanvasCss(clientX, clientY);
    if (!renderer?.raycastSurfacePoint || !css) return false;

    const hit = renderer.raycastSurfacePoint(css.x, css.y);
    if (!hit) return false; // click en el vacío: dejamos que la cámara actúe (orbit/pan)

    const id = nextStrokeId();
    setStrokes((prev) => [...prev, { id, points: [hit.point], color: paintColorRef.current }]);
    drawingIdRef.current = id;
    return true;
  }, [rendererRef, clientToCanvasCss]);

  const handlePaintMouseMove = useCallback((clientX: number, clientY: number): boolean => {
    const id = drawingIdRef.current;
    if (!id) return false;

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
  }, [rendererRef, clientToCanvasCss]);

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