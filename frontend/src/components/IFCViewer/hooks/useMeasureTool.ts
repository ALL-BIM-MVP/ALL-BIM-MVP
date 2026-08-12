// Medición simple: dos puntos por medición, con snap magnético nativo del
// renderer (renderer.raycastSceneMagnetic). Misma lógica de interacción que la
// cruz de ejes (useCrossTool.ts):
//
// - El botón (submenú Regla → Medición) "arma" una colocación: activa el modo
//   si no estaba y deja el próximo click listo para poner el punto 1.
// - Point 1 → queda pendiente el punto 2: el SIGUIENTE click (sin volver a
//   apretar el botón) lo coloca donde sea que hagas click, y ahí se cierra esa
//   medición — la cámara vuelve a moverse libre.
// - Click cerca de cualquier punto YA puesto (de cualquier medición) → lo
//   agarra para arrastrarlo, en cualquier momento, armado o no.
// - Click en el vacío sin geometría debajo, ni cerca de ningún punto, ni con
//   una medición pendiente de su 2do punto → no se consume: la cámara sigue
//   orbitando/paneando normal.
// - Se pueden tener varias mediciones activas a la vez.
import { useState, useRef, useEffect, useCallback } from 'react';

interface Vec3 { x: number; y: number; z: number; }
interface ScreenPos { x: number; y: number; }

type SnapType = 'vertex' | 'edge' | 'face' | 'face_center' | 'none';

interface MeasurePointEntry extends Vec3 {
  screen: ScreenPos | null;
  snapped?: boolean;
  snapType?: SnapType;
}

export interface MeasureEntry {
  id: string;
  points: MeasurePointEntry[]; // 1 (esperando 2do punto) o 2 (completa)
  distance: number | null;
}

interface EdgeLockState {
  edge: { v0: Vec3; v1: Vec3 } | null;
  meshExpressId: number | null;
  lockStrength: number;
}
interface SnapResult {
  point: Vec3;
  snapped: boolean;
  snapType: SnapType;
  edge?: { v0: Vec3; v1: Vec3 };
}

const DRAG_HIT_RADIUS = 10; // px — agarrar un punto ya puesto
const EMPTY_EDGE_LOCK: EdgeLockState = { edge: null, meshExpressId: null, lockStrength: 0 };

let measureIdCounter = 0;
const nextMeasureId = () => `measure_${++measureIdCounter}`;

export function useMeasureTool(
  rendererRef: React.RefObject<any>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  snapEnabled: boolean = true
) {
  const [measureMode, setMeasureMode] = useState(false);
  const [measureArmed, setMeasureArmed] = useState(false); // true = "el próximo click pone un punto"
  const [measurements, setMeasurements] = useState<MeasureEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null); // medición esperando su 2do punto
  const [hoverPoint, setHoverPoint] = useState<MeasurePointEntry | null>(null);
  const [hoverEdge, setHoverEdge] = useState<{ a: ScreenPos; b: ScreenPos } | null>(null);

  const measureModeRef = useRef(false);
  const measureArmedRef = useRef(false);
  const measurementsRef = useRef<MeasureEntry[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const draggingRef = useRef<{ id: string; pointIndex: 0 | 1 } | null>(null);
  const edgeLockRef = useRef<EdgeLockState>(EMPTY_EDGE_LOCK);

  useEffect(() => { measureModeRef.current = measureMode; }, [measureMode]);
  useEffect(() => { measureArmedRef.current = measureArmed; }, [measureArmed]);
  useEffect(() => { measurementsRef.current = measurements; }, [measurements]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  useEffect(() => {
    if (!measureMode) {
      setMeasurements([]);
      setActiveId(null);
      setMeasureArmed(false);
      draggingRef.current = null;
      setHoverPoint(null);
      setHoverEdge(null);
      edgeLockRef.current = EMPTY_EDGE_LOCK;
    }
  }, [measureMode]);

  const clientToCanvasCss = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, [canvasRef]);

  const projectPoint = useCallback((point: Vec3): ScreenPos | null => {
    const renderer = rendererRef.current;
    const camera = renderer?.getCamera?.();
    const canvas = canvasRef.current;
    if (!camera || !canvas || typeof camera.projectToScreen !== 'function') return null;
    try {
      const raw = camera.projectToScreen(point, canvas.width, canvas.height);
      if (!raw) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return { x: raw.x / scaleX, y: raw.y / scaleY };
    } catch {
      return null;
    }
  }, [rendererRef, canvasRef]);

  const magneticSnapAt = useCallback((clientX: number, clientY: number): SnapResult | null => {
    const renderer = rendererRef.current;
    const css = clientToCanvasCss(clientX, clientY);
    if (!renderer?.raycastSceneMagnetic || !css) return null;

    try {
      const result = renderer.raycastSceneMagnetic(
        css.x,
        css.y,
        snapEnabled ? edgeLockRef.current : EMPTY_EDGE_LOCK,
        {}
      );

      if (result?.edgeLock) {
        edgeLockRef.current = {
          edge: result.edgeLock.edge,
          meshExpressId: result.edgeLock.meshExpressId,
          lockStrength: result.edgeLock.shouldLock ? 1 : 0,
        };
      }

      const target = result?.snapTarget;
      if (target && snapEnabled) {
        return {
          point: target.position as Vec3,
          snapped: true,
          snapType: target.type as SnapType,
          edge: result.edgeLock?.edge ?? undefined,
        };
      }

      const fallbackPoint = result?.intersection?.point ?? null;
      if (fallbackPoint) {
        return { point: fallbackPoint as Vec3, snapped: false, snapType: 'none', edge: undefined };
      }
      return null;
    } catch (err) {
      console.warn('Error en raycastSceneMagnetic:', err);
      return null;
    }
  }, [rendererRef, clientToCanvasCss, snapEnabled]);

  const buildPointEntry = useCallback((result: SnapResult): MeasurePointEntry => ({
    ...result.point,
    screen: projectPoint(result.point),
    snapped: result.snapped,
    snapType: result.snapType,
  }), [projectPoint]);

  const recomputeDistance = (points: MeasurePointEntry[]): number | null => {
    if (points.length !== 2) return null;
    const [p1, p2] = points;
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2);
  };

  // Se llama al elegir "Medición" en el submenú: activa el modo (si no lo
  // estaba) y arma la colocación del próximo punto 1.
  const enableAndArmMeasure = useCallback(() => {
    setMeasureMode(true);
    setMeasureArmed(true);
  }, []);

  const exitMeasureMode = useCallback(() => {
    setMeasureMode(false); // el useEffect de arriba limpia todo
  }, []);

  const clearMeasurement = useCallback(() => {
    setMeasurements([]);
    setActiveId(null);
    draggingRef.current = null;
  }, []);

  const removeMeasurement = useCallback((id: string) => {
    setMeasurements(prev => prev.filter(m => m.id !== id));
    if (activeIdRef.current === id) setActiveId(null);
    if (draggingRef.current?.id === id) draggingRef.current = null;
  }, []);

  // Busca, entre TODOS los puntos de TODAS las mediciones, el más cercano al
  // click (en píxeles) dentro del radio de agarre.
  const hitTestPoint = useCallback((clientX: number, clientY: number): { id: string; pointIndex: 0 | 1 } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    let best: { id: string; pointIndex: 0 | 1 } | null = null;
    let bestDist = Infinity;
    for (const m of measurementsRef.current) {
      for (let i = 0; i < m.points.length; i++) {
        const p = m.points[i];
        if (!p.screen) continue;
        const d = Math.hypot(p.screen.x - localX, p.screen.y - localY);
        if (d <= DRAG_HIT_RADIUS && d < bestDist) {
          bestDist = d;
          best = { id: m.id, pointIndex: i as 0 | 1 };
        }
      }
    }
    return best;
  }, [canvasRef]);

  const handleMeasureMouseDown = useCallback((clientX: number, clientY: number): boolean => {
    if (!measureModeRef.current) return false;

    // 1) Agarrar un punto ya puesto (de cualquier medición) — funciona siempre.
    const hit = hitTestPoint(clientX, clientY);
    if (hit) {
      draggingRef.current = hit;
      return true;
    }

    // 2) Hay una medición esperando su 2do punto — este click lo coloca y la cierra.
    const pendingId = activeIdRef.current;
    if (pendingId) {
      const result = magneticSnapAt(clientX, clientY);
      if (!result) return false; // no había geometría bajo el click: dejamos pasar el evento
      const newPoint = buildPointEntry(result);
      setMeasurements(prev => prev.map(m => {
        if (m.id !== pendingId) return m;
        const points = [...m.points, newPoint];
        return { ...m, points, distance: recomputeDistance(points) };
      }));
      draggingRef.current = { id: pendingId, pointIndex: 1 };
      setActiveId(null);
      setMeasureArmed(false);
      return true;
    }

    // 3) Armado y sin medición pendiente: arranca una medición nueva (punto 1).
    if (measureArmedRef.current) {
      const result = magneticSnapAt(clientX, clientY);
      if (!result) return false; // sin geometría bajo el click: seguimos armados, que la cámara actúe este click
      const id = nextMeasureId();
      const point = buildPointEntry(result);
      setMeasurements(prev => [...prev, { id, points: [point], distance: null }]);
      setActiveId(id);
      draggingRef.current = { id, pointIndex: 0 };
      return true;
    }

    return false; // nada armado ni pendiente: cámara normal
  }, [hitTestPoint, magneticSnapAt, buildPointEntry]);

  const handleMeasureMouseMove = useCallback((clientX: number, clientY: number): boolean => {
    const drag = draggingRef.current;
    if (!drag) return false;

    const result = magneticSnapAt(clientX, clientY);
    if (!result) return true; // seguimos "consumiendo" el move aunque no haya snap nuevo
    const newPoint = buildPointEntry(result);

    setMeasurements(prev => prev.map(m => {
      if (m.id !== drag.id) return m;
      const points = m.points.map((p, i) => (i === drag.pointIndex ? newPoint : p));
      return { ...m, points, distance: recomputeDistance(points) };
    }));
    return true;
  }, [magneticSnapAt, buildPointEntry]);

  const handleMeasureMouseUp = useCallback((): boolean => {
    if (draggingRef.current) {
      draggingRef.current = null;
      return true;
    }
    return false;
  }, []);

  // Preview de snap mientras estás a punto de poner un punto (armado sin
  // medición pendiente, o con una medición esperando su 2do punto).
  const updateHoverPreview = useCallback((clientX: number, clientY: number) => {
    const aboutToPlace = measureArmedRef.current || activeIdRef.current !== null;
    if (!measureModeRef.current || !aboutToPlace || draggingRef.current) {
      setHoverPoint(null);
      setHoverEdge(null);
      return;
    }
    const result = magneticSnapAt(clientX, clientY);
    if (!result) {
      setHoverPoint(null);
      setHoverEdge(null);
      return;
    }
    setHoverPoint(buildPointEntry(result));

    if (result.snapType === 'edge' && result.edge) {
      const screenA = projectPoint(result.edge.v0);
      const screenB = projectPoint(result.edge.v1);
      setHoverEdge(screenA && screenB ? { a: screenA, b: screenB } : null);
    } else {
      setHoverEdge(null);
    }
  }, [magneticSnapAt, buildPointEntry, projectPoint]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && measureModeRef.current) clearMeasurement();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [clearMeasurement]);

  const reprojectOnFrame = useCallback(() => {
    if (!measureModeRef.current || measurementsRef.current.length === 0) return;
    const dragId = draggingRef.current?.id ?? null;
    setMeasurements(prev => prev.map(m => {
      if (m.id === dragId) return m; // esa se recalcula por raycast en el mousemove
      const points = m.points.map(p => ({ ...p, screen: projectPoint(p) }));
      return { ...m, points };
    }));
  }, [projectPoint]);

  return {
    measureMode, measureModeRef, measureArmed, enableAndArmMeasure, exitMeasureMode,
    measurements, clearMeasurement, removeMeasurement,
    measureHoverPoint: hoverPoint, hoverEdge,
    handleMeasureMouseDown, handleMeasureMouseMove, handleMeasureMouseUp, updateHoverPreview,
    reprojectOnFrame,
  };
}