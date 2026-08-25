// Herramienta "cruz de ejes": permite tener VARIAS cruces activas a la vez (una

import { useState, useRef, useEffect, useCallback } from 'react';
import { cameraOrCanvasChanged, type CameraSnapshot } from '../utils/cameraChangeDetector';

interface Vec3 { x: number; y: number; z: number; }
interface ScreenPos { x: number; y: number; }

export interface CrossData {
  center: Vec3;
  normal: Vec3;
  uPos: Vec3; uNeg: Vec3;
  vPos: Vec3; vNeg: Vec3;
  depthPos: Vec3 | null;
  expressId: number | null;
}

export interface CrossEntry extends CrossData {
  id: string;
  centerScreen: ScreenPos | null;
  uPosScreen: ScreenPos | null; uNegScreen: ScreenPos | null;
  vPosScreen: ScreenPos | null; vNegScreen: ScreenPos | null;
  depthPosScreen: ScreenPos | null;
}

const DRAG_HIT_RADIUS = 14; // px — qué tan cerca del centro tenés que clickear para agarrar esa cruz

function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

let crossIdCounter = 0;
const nextCrossId = () => `cross_${++crossIdCounter}`;

export function useCrossTool(
  rendererRef: React.RefObject<any>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const [crossMode, setCrossMode] = useState(false);
  const [armed, setArmed] = useState(false); // true = "el próximo click coloca una cruz nueva"
  const [crosses, setCrosses] = useState<CrossEntry[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const crossModeRef = useRef(false);
  const armedRef = useRef(false);
  const crossesRef = useRef<CrossEntry[]>([]);
  const draggingIdRef = useRef<string | null>(null);
  const lastCameraSnapshotRef = useRef<CameraSnapshot | null>(null);

  useEffect(() => { crossModeRef.current = crossMode; }, [crossMode]);
  useEffect(() => { armedRef.current = armed; }, [armed]);
  useEffect(() => { crossesRef.current = crosses; }, [crosses]);
  useEffect(() => { draggingIdRef.current = draggingId; }, [draggingId]);
  useEffect(() => {
    if (!crossMode) { setCrosses([]); setDraggingId(null); setArmed(false); }
  }, [crossMode]);

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

  const clientToCanvasCss = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, [canvasRef]);

  const withScreen = useCallback((result: CrossData, id: string): CrossEntry => ({
    ...result,
    id,
    centerScreen: projectPoint(result.center),
    uPosScreen: projectPoint(result.uPos),
    uNegScreen: projectPoint(result.uNeg),
    vPosScreen: projectPoint(result.vPos),
    vNegScreen: projectPoint(result.vNeg),
    depthPosScreen: result.depthPos ? projectPoint(result.depthPos) : null,
  }), [projectPoint]);

  const computeCrossAt = useCallback((clientX: number, clientY: number, id: string, fast = false): CrossEntry | null => {
    const renderer = rendererRef.current;
    const css = clientToCanvasCss(clientX, clientY);
    if (!renderer?.raycastFaceCross || !css) return null;
    try {
      const result: CrossData | null = renderer.raycastFaceCross(css.x, css.y, fast);
      return result ? withScreen(result, id) : null;
    } catch (err) {
      console.warn('Error en raycastFaceCross:', err);
      return null;
    }
  }, [rendererRef, clientToCanvasCss, withScreen]);

  const enableAndArm = useCallback(() => {
    setCrossMode(true);
    setArmed(true);
  }, []);

  
  const exitCrossMode = useCallback(() => {
    setCrossMode(false); 
  }, []);

  const clearCross = useCallback(() => {
    setCrosses([]);
    setDraggingId(null);
  }, []);

  const removeCross = useCallback((id: string) => {
    setCrosses(prev => prev.filter(c => c.id !== id));
    if (draggingIdRef.current === id) setDraggingId(null);
  }, []);

  // Busca, entre las cruces existentes, la más cercana al click (en píxeles),
  // dentro del radio de agarre. null si ninguna está lo bastante cerca.
  const hitTestCenter = useCallback((clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    let bestId: string | null = null;
    let bestDist = Infinity;
    for (const c of crossesRef.current) {
      if (!c.centerScreen) continue;
      const d = Math.hypot(c.centerScreen.x - localX, c.centerScreen.y - localY);
      if (d <= DRAG_HIT_RADIUS && d < bestDist) { bestDist = d; bestId = c.id; }
    }
    return bestId;
  }, [canvasRef]);

  const handleCrossMouseDown = useCallback((clientX: number, clientY: number): boolean => {
    if (!crossModeRef.current) return false;

    // Agarrar el centro de una cruz existente funciona SIEMPRE, armado o no —
    // así se puede seguir ajustando lo que ya está puesto sin "gastar" el arme.
    const hitId = hitTestCenter(clientX, clientY);
    if (hitId) {
      setDraggingId(hitId);
      return true;
    }

    // Sin arme activo: no consumimos el click, la cámara orbita/paneé normal.
    if (!armedRef.current) return false;

    
    const id = nextCrossId();

    const next = computeCrossAt(clientX, clientY, id, true);
    setArmed(false);
    if (next) {
      setCrosses(prev => [...prev, next]);
      setDraggingId(id);
      return true;
    }
    return false; // no había geometría bajo el click: dejamos pasar el evento igual
  }, [hitTestCenter, computeCrossAt]);

  const handleCrossMouseMove = useCallback((clientX: number, clientY: number): boolean => {
    const id = draggingIdRef.current;
    if (!id) return false;
    const next = computeCrossAt(clientX, clientY, id);
    if (next) {
      setCrosses(prev => prev.map(c => (c.id === id ? next : c)));
    }
    return true;
  }, [computeCrossAt]);

  const handleCrossMouseUp = useCallback((): boolean => {
    if (draggingIdRef.current) {
      setDraggingId(null);
      return true;
    }
    return false;
  }, []);

  // Sin preview de hover — cada cruz solo aparece al hacer click. Se deja el
  // hook por simetría de firma con la medición simple / useCameraControls.
  const updateCrossHover = useCallback((_clientX: number, _clientY: number) => {}, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && crossModeRef.current) clearCross();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [clearCross]);

  const reprojectOnFrame = useCallback(() => {
    if (!crossModeRef.current || crossesRef.current.length === 0) return;
    
    if (!cameraOrCanvasChanged(rendererRef.current, canvasRef.current, lastCameraSnapshotRef)) return;
    const draggingNow = draggingIdRef.current;
    setCrosses(prev => prev.map(c => {
      if (c.id === draggingNow) return c; // esa se está recalculando por raycast en el mousemove
      return {
        ...c,
        centerScreen: projectPoint(c.center),
        uPosScreen: projectPoint(c.uPos),
        uNegScreen: projectPoint(c.uNeg),
        vPosScreen: projectPoint(c.vPos),
        vNegScreen: projectPoint(c.vNeg),
        depthPosScreen: c.depthPos ? projectPoint(c.depthPos) : null,
      };
    }));
  }, [projectPoint, rendererRef, canvasRef]);

  // Longitudes derivadas de cada cruz, listas para pintar sin recalcular en el JSX.
  const crossesWithLengths = crosses.map(c => ({
    ...c,
    lengthU: dist3D(c.uNeg, c.uPos),
    lengthV: dist3D(c.vNeg, c.vPos),
    lengthDepth: c.depthPos ? dist3D(c.center, c.depthPos) : null,
  }));

  return {
    crossMode, crossModeRef, armed, enableAndArm, exitCrossMode, clearCross, removeCross,
    crosses: crossesWithLengths,
    draggingId,
    handleCrossMouseDown, handleCrossMouseMove, handleCrossMouseUp, updateCrossHover,
    reprojectOnFrame,
  };
}