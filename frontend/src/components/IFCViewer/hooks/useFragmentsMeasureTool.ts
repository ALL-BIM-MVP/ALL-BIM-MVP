
import { useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { SnappingClass } from '@thatopen/fragments';
import { cameraOrCanvasChanged, type CameraSnapshot } from '../utils/cameraChangeDetector';
import { buildTempMeshForItem, planeMeshIntersectionSegments } from '../utils/crossMath';

interface Vec3 { x: number; y: number; z: number; }
interface ScreenPos { x: number; y: number; }
type SnapType = 'vertex' | 'edge' | 'face' | 'none';
interface FragMeasurePoint extends Vec3 { screen: ScreenPos | null; snapType?: SnapType; }
export interface FragMeasureEntry {
  id: string;
  points: FragMeasurePoint[]; // 1 (esperando el 2do punto) o 2 (completa)
  distance: number | null;
}

let idCounter = 0;
const nextId = () => `fragmeasure_${++idCounter}`;

const DRAG_HIT_RADIUS = 10; // px — agarrar un punto ya puesto, mismo radio que useMeasureTool.ts
const DRAG_THROTTLE_MS = 32; // mismo criterio que SNAP_THROTTLE_MS en useMeasureTool.ts

const SNAP_TYPE_BY_CLASS: Record<number, SnapType> = {
  [SnappingClass.POINT]: 'vertex',
  [SnappingClass.LINE]: 'edge',
  [SnappingClass.FACE]: 'face',
};


const EDGE_HINT_HALF_LEN = 0.2;
function shortEdgeSegment(v0: Vec3, v1: Vec3, point: Vec3, halfLen: number): { p0: Vec3; p1: Vec3 } {
  const dx = v1.x - v0.x, dy = v1.y - v0.y, dz = v1.z - v0.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return { p0: point, p1: point };
  const ux = dx / len, uy = dy / len, uz = dz / len;
  const t = (point.x - v0.x) * ux + (point.y - v0.y) * uy + (point.z - v0.z) * uz;
  const tClamped = Math.max(0, Math.min(len, t));
  const t0 = Math.max(0, tClamped - halfLen);
  const t1 = Math.min(len, tClamped + halfLen);
  return {
    p0: { x: v0.x + ux * t0, y: v0.y + uy * t0, z: v0.z + uz * t0 },
    p1: { x: v0.x + ux * t1, y: v0.y + uy * t1, z: v0.z + uz * t1 },
  };
}

// Con un corte activo, model.raycast/raycastWithSnapping siguen viendo
// la geometría del lado invisible (el recorte es solo visual, a nivel
// GPU) — un punto ahí es un fantasma, no algo que el usuario ve en pantalla.
function isVisiblePoint(p: Vec3, clipPlane: THREE.Plane | null): boolean {
  return !clipPlane || clipPlane.distanceToPoint(new THREE.Vector3(p.x, p.y, p.z)) >= 0;
}

function worldToClientPx(camera: THREE.Camera, dom: HTMLCanvasElement, p: THREE.Vector3): ScreenPos {
  const v = p.clone().project(camera);
  const rect = dom.getBoundingClientRect();
  return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (1 - (v.y * 0.5 + 0.5)) * rect.height };
}

const CUT_EDGE_SNAP_PX = 12;

// El contorno del corte (donde el plano atraviesa el elemento) no es
// geometría real — clippingPlanes solo oculta triángulos al dibujar, así
// que hay que calcularlo acá para poder engancharse a él.
async function snapToCutBoundary(
  model: any,
  localId: number,
  clipPlane: THREE.Plane,
  camera: THREE.Camera,
  dom: HTMLCanvasElement,
  meshCache: Map<number, THREE.Mesh>,
  mousePx: ScreenPos
): Promise<{ point: Vec3; edge: { v0: Vec3; v1: Vec3 } } | null> {
  let mesh = meshCache.get(localId);
  if (!mesh) {
    const built = await buildTempMeshForItem(model, localId, (model.object as THREE.Object3D).matrixWorld);
    if (!built) return null;
    mesh = built;
    meshCache.set(localId, mesh);
  }

  let best: { point: Vec3; edge: { v0: Vec3; v1: Vec3 } } | null = null;
  let bestDist = CUT_EDGE_SNAP_PX;
  for (const seg of planeMeshIntersectionSegments(mesh, clipPlane)) {
    const pa = worldToClientPx(camera, dom, seg.a);
    const pb = worldToClientPx(camera, dom, seg.b);
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq < 1e-9 ? 0 : Math.max(0, Math.min(1, ((mousePx.x - pa.x) * dx + (mousePx.y - pa.y) * dy) / lenSq));
    const screenX = pa.x + dx * t, screenY = pa.y + dy * t;
    const dist = Math.hypot(mousePx.x - screenX, mousePx.y - screenY);
    if (dist < bestDist) {
      bestDist = dist;
      const point = seg.a.clone().lerp(seg.b, t);
      best = {
        point: { x: point.x, y: point.y, z: point.z },
        edge: { v0: { x: seg.a.x, y: seg.a.y, z: seg.a.z }, v1: { x: seg.b.x, y: seg.b.y, z: seg.b.z } },
      };
    }
  }
  return best;
}

async function bestSnapPoint(
  model: any,
  camera: any,
  mouse: THREE.Vector2,
  dom: HTMLCanvasElement,
  clipPlane: THREE.Plane | null,
  meshCache: Map<number, THREE.Mesh>
): Promise<{ point: Vec3; snapType: SnapType; edge?: { v0: Vec3; v1: Vec3 } } | null> {
  const candidates = await model.raycastWithSnapping({
    camera, mouse, dom,
    snappingClasses: [SnappingClass.POINT, SnappingClass.LINE, SnappingClass.FACE],
  });
  const visibleCandidates = (candidates ?? []).filter((r: any) => isVisiblePoint(r.point, clipPlane));

  // Punto/arista reales ganan siempre — el contorno del corte solo
  // compite con la cara (ver más abajo), nunca los pisa.
  const pointOrLine = [SnappingClass.POINT, SnappingClass.LINE]
    .map((cls) => visibleCandidates.find((r: any) => r.snappingClass === cls))
    .find(Boolean);
  if (pointOrLine) {
    const edge = pointOrLine.snappedEdgeP1 && pointOrLine.snappedEdgeP2
      ? { v0: pointOrLine.snappedEdgeP1 as Vec3, v1: pointOrLine.snappedEdgeP2 as Vec3 }
      : undefined;
    return { point: pointOrLine.point, snapType: SNAP_TYPE_BY_CLASS[pointOrLine.snappingClass], edge };
  }

  const faceCandidate = visibleCandidates.find((r: any) => r.snappingClass === SnappingClass.FACE);

  if (clipPlane) {
    // El contorno del corte (arista sintética, no viene de Fragments) se
    // prueba SIEMPRE que hay un corte activo, junto con la cara — no solo
    // cuando no hay ningún candidato — para que gane si estás más cerca
    // de esa arista que del resto de la cara.
    let localId: number | null = faceCandidate?.localId ?? candidates?.[0]?.localId ?? null;
    let facePoint: Vec3 | null = faceCandidate?.point ?? null;

    if (localId == null || !facePoint) {
      const hits = await model.raycastAll({ camera, mouse, dom });
      const visible = (hits ?? [])
        .filter((h: any) => isVisiblePoint(h.point, clipPlane))
        .sort((a: any, b: any) => (a.rayDistance ?? a.distance) - (b.rayDistance ?? b.distance));
      const nearest = visible[0];
      if (nearest) {
        localId = localId ?? nearest.localId;
        facePoint = facePoint ?? nearest.point;
      }
    }

    const boundary = localId != null
      ? await snapToCutBoundary(model, localId, clipPlane, camera, dom, meshCache, { x: mouse.x, y: mouse.y })
      : null;
    if (boundary) return { point: boundary.point, snapType: 'edge', edge: boundary.edge };
    return facePoint ? { point: facePoint, snapType: 'face' } : null;
  }

  if (faceCandidate) return { point: faceCandidate.point, snapType: 'face' };
  const plain = await model.raycast({ camera, mouse, dom });
  return plain ? { point: plain.point, snapType: 'face' } : null;
}

export function useFragmentsMeasureTool(
  rendererRef: React.RefObject<any>,
  storeRef: React.RefObject<any>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const [measureMode, setMeasureMode] = useState(false);
  const measureModeRef = useRef(false);
  useEffect(() => { measureModeRef.current = measureMode; }, [measureMode]);

  const cutBoundaryMeshCacheRef = useRef(new Map<number, THREE.Mesh>());

  
  const [measureArmed, setMeasureArmed] = useState(false);
  const measureArmedRef = useRef(false);
  useEffect(() => { measureArmedRef.current = measureArmed; }, [measureArmed]);

  const [measurements, setMeasurements] = useState<FragMeasureEntry[]>([]);
  const measurementsRef = useRef<FragMeasureEntry[]>([]);
  useEffect(() => { measurementsRef.current = measurements; }, [measurements]);

 
  const [hoverPoint, setHoverPoint] = useState<FragMeasurePoint | null>(null);

  const [hoverEdge, setHoverEdge] = useState<{ a: ScreenPos; b: ScreenPos } | null>(null);
  
  const [hoverColor, setHoverColor] = useState('#0056b3');

  const [draggingPoint, setDraggingPoint] = useState<{ id: string; pointIndex: number } | null>(null);

 
  const measureBusyRef = useRef(false);
  useEffect(() => {
    measureBusyRef.current = measureArmed || draggingPoint !== null;
  }, [measureArmed, draggingPoint]);

  
  const busyRef = useRef(false);

  const labelElsRef = useRef(new Map<string, HTMLDivElement>());
  const registerFragmentsMeasureLabelEl = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) labelElsRef.current.set(id, el);
    else labelElsRef.current.delete(id);
  }, []);

  const lastCameraSnapshotRef = useRef<CameraSnapshot | null>(null);

  useEffect(() => {
    if (!measureMode) {
      setMeasurements([]);
      setHoverPoint(null);
      setHoverEdge(null);
      setMeasureArmed(false);
      setDraggingPoint(null);
    }
  }, [measureMode]);

  const enableAndArmFragmentsMeasure = useCallback(() => {
    setMeasureMode(true);
    setMeasureArmed(true);
  }, []);
  const exitFragmentsMeasureMode = useCallback(() => setMeasureMode(false), []);
  const clearFragmentsMeasurement = useCallback(() => setMeasurements([]), []);
  const removeFragmentsMeasurement = useCallback((id: string) => {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const projectPoint = useCallback((p: Vec3): ScreenPos | null => {
    const renderer = rendererRef.current;
    const camera = renderer?.getCamera?.();
    const canvas = canvasRef.current;
    if (!camera || !canvas || typeof camera.projectToScreen !== 'function') return null;
    try {
      const raw = camera.projectToScreen(p, canvas.width, canvas.height);
      if (!raw) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return { x: raw.x / scaleX, y: raw.y / scaleY };
    } catch {
      return null;
    }
  }, [rendererRef, canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let downX = 0, downY = 0;

    const draggingRef: { current: { id: string; pointIndex: number } | null } = { current: null };
    let wasDragging = false;
    let lastDragMoveAt = 0;
    let lastHoverMoveAt = 0;
    let hoverBusy = false; // guard aparte del de click/arrastre — el hover no tiene que competir por ese turno

    const hitTestPoint = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const localX = clientX - rect.left, localY = clientY - rect.top;
      for (const m of measurementsRef.current) {
        for (let i = 0; i < m.points.length; i++) {
          const p = m.points[i];
          if (!p.screen) continue;
          if (Math.hypot(p.screen.x - localX, p.screen.y - localY) <= DRAG_HIT_RADIUS) {
            return { id: m.id, pointIndex: i };
          }
        }
      }
      return null;
    };

    const onMouseDown = (e: MouseEvent) => {
      downX = e.clientX; downY = e.clientY;
      if (!measureModeRef.current) return;
      const hit = hitTestPoint(e.clientX, e.clientY);
      if (hit) {
        draggingRef.current = hit;
        setDraggingPoint(hit);
     
        e.stopImmediatePropagation();
      }
    };

    const onWindowMouseMove = async (e: MouseEvent) => {
      const drag = draggingRef.current;
      if (!drag) return;
      e.stopImmediatePropagation();

      const now = performance.now();
      if (now - lastDragMoveAt < DRAG_THROTTLE_MS) return;
      lastDragMoveAt = now;
      if (busyRef.current) return;

      const model = storeRef.current?.fragmentsModel;
      const camera = rendererRef.current?.getCamera?.()?.camera;
      if (!model || !camera) return;

      busyRef.current = true;
      try {
        const mouse = new THREE.Vector2(e.clientX, e.clientY);
        const clipPlane = rendererRef.current?.getClipPlane?.() ?? null;
        const snap = await bestSnapPoint(model, camera, mouse, canvas, clipPlane, cutBoundaryMeshCacheRef.current);
        if (!snap) return;
        const screen = projectPoint(snap.point);

        setMeasurements((prev) => prev.map((m) => {
          if (m.id !== drag.id) return m;
          const points = m.points.map((p, i) => (i === drag.pointIndex ? { ...snap.point, screen, snapType: snap.snapType } : p));
          const distance = points.length === 2
            ? Math.sqrt((points[1].x - points[0].x) ** 2 + (points[1].y - points[0].y) ** 2 + (points[1].z - points[0].z) ** 2)
            : null;
          return { ...m, points, distance };
        }));

        setHoverPoint({ ...snap.point, screen, snapType: snap.snapType });
    
        setHoverColor('#2dd4bf');

        if (snap.snapType === 'edge' && snap.edge) {
          const { p0, p1 } = shortEdgeSegment(snap.edge.v0, snap.edge.v1, snap.point, EDGE_HINT_HALF_LEN);
          const screenA = projectPoint(p0);
          const screenB = projectPoint(p1);
          setHoverEdge(screenA && screenB ? { a: screenA, b: screenB } : null);
        } else {
          setHoverEdge(null);
        }
      } catch (err) {
        console.warn('[useFragmentsMeasureTool] error al arrastrar el punto:', err);
      } finally {
        busyRef.current = false;
      }
    };

   
    const onHoverMove = async (e: MouseEvent) => {
      if (!measureArmedRef.current || draggingRef.current) return;
      const now = performance.now();
      if (now - lastHoverMoveAt < DRAG_THROTTLE_MS) return;
      lastHoverMoveAt = now;
      if (hoverBusy) return;

      const model = storeRef.current?.fragmentsModel;
      const camera = rendererRef.current?.getCamera?.()?.camera;
      if (!model || !camera) return;

      hoverBusy = true;
      try {
        const mouse = new THREE.Vector2(e.clientX, e.clientY);
        const clipPlane = rendererRef.current?.getClipPlane?.() ?? null;
        const snap = await bestSnapPoint(model, camera, mouse, canvas, clipPlane, cutBoundaryMeshCacheRef.current);
        if (!measureArmedRef.current || draggingRef.current) return; // se desarmó/empezó a arrastrar mientras esto resolvía
        if (!snap) { setHoverPoint(null); setHoverEdge(null); return; }
        const screen = projectPoint(snap.point);
        setHoverPoint({ ...snap.point, screen, snapType: snap.snapType });
    
        const hasPending = measurementsRef.current.some((m) => m.points.length === 1);
        setHoverColor(hasPending ? '#dc2626' : '#0056b3');

        if (snap.snapType === 'edge' && snap.edge) {
          const { p0, p1 } = shortEdgeSegment(snap.edge.v0, snap.edge.v1, snap.point, EDGE_HINT_HALF_LEN);
          const screenA = projectPoint(p0);
          const screenB = projectPoint(p1);
          setHoverEdge(screenA && screenB ? { a: screenA, b: screenB } : null);
        } else {
          setHoverEdge(null);
        }
      } catch (err) {
        console.warn('[useFragmentsMeasureTool] error al calcular el punto bajo el mouse:', err);
      } finally {
        hoverBusy = false;
      }
    };

    const onMouseLeave = () => { setHoverPoint(null); setHoverEdge(null); };

    const onWindowMouseUp = (e: MouseEvent) => {
      if (draggingRef.current) {
        draggingRef.current = null;
        wasDragging = true;
        setHoverEdge(null); // se soltó el punto — el resaltado de arista/vértice del arrastre ya no aplica
        setHoverPoint(null);
        setDraggingPoint(null);
        e.stopImmediatePropagation();
      }
    };

    const onClick = async (e: MouseEvent) => {
      if (wasDragging) { wasDragging = false; return; } // el click que sigue a soltar un arrastre no pone un punto nuevo
      if (!measureArmedRef.current) return; // desarmado (ya se completó una medición) — este click es de cámara, no pone nada
      const model = storeRef.current?.fragmentsModel;
      const camera = rendererRef.current?.getCamera?.()?.camera;
      if (!model || !camera) return; // no hay modelo de Fragments cargado, no hace nada
      if (Math.hypot(e.clientX - downX, e.clientY - downY) >= 4) return; // arrastre de cámara, no click
      if (busyRef.current) return;

    
      const mouse = new THREE.Vector2(e.clientX, e.clientY);

      busyRef.current = true;
      try {
        const clipPlane = rendererRef.current?.getClipPlane?.() ?? null;
        const snap = await bestSnapPoint(model, camera, mouse, canvas, clipPlane, cutBoundaryMeshCacheRef.current);
        if (!snap) return;
        const screen = projectPoint(snap.point);

        const active = measurementsRef.current.find((m) => m.points.length === 1);
        if (active) {
      
          setMeasurements((prev) => prev.map((m) => {
            if (m.id !== active.id) return m;
            const points = [...m.points, { ...snap.point, screen, snapType: snap.snapType }];
            const [p1, p2] = points;
            const distance = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2 + (p2.z - p1.z) ** 2);
            return { ...m, points, distance };
          }));
          setMeasureArmed(false);
          setHoverPoint(null);
          setHoverEdge(null);
        } else {
          
          setMeasurements((prev) => [
            ...prev,
            { id: nextId(), points: [{ ...snap.point, screen, snapType: snap.snapType }], distance: null },
          ]);
        }
      } catch (err) {
        console.warn('[useFragmentsMeasureTool] error al medir:', err);
      } finally {
        busyRef.current = false;
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onWindowMouseMove);
    canvas.addEventListener('mousemove', onHoverMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('mouseup', onWindowMouseUp);
    canvas.addEventListener('click', onClick);
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onWindowMouseMove);
      canvas.removeEventListener('mousemove', onHoverMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('mouseup', onWindowMouseUp);
      canvas.removeEventListener('click', onClick);
    };
  }, [rendererRef, storeRef, canvasRef, projectPoint]);

  const reprojectFragmentsMeasureOnFrame = useCallback(() => {
    if (!measureModeRef.current || measurementsRef.current.length === 0) return;
    if (!cameraOrCanvasChanged(rendererRef.current, canvasRef.current, lastCameraSnapshotRef)) return;

    const updated = measurementsRef.current.map((m) => ({
      ...m,
      points: m.points.map((p) => ({ ...p, screen: projectPoint(p) })),
    }));

    for (const m of updated) {
      const el = labelElsRef.current.get(m.id);
      if (!el) continue;
      const [p1, p2] = m.points;
      if (p2 && p1?.screen && p2?.screen) {
        const midX = (p1.screen.x + p2.screen.x) / 2;
        const midY = (p1.screen.y + p2.screen.y) / 2;
        el.style.transform = `translate(${midX}px, ${midY}px)`;
      }
    }

    setMeasurements(updated);
  }, [projectPoint, rendererRef, canvasRef]);

  return {
    fragmentsMeasureMode: measureMode,
    fragmentsMeasureModeRef: measureModeRef,
    
    fragmentsMeasureBusyRef: measureBusyRef,
    fragmentsMeasurements: measurements,
    fragmentsMeasureHoverPoint: hoverPoint,
    fragmentsMeasureHoverColor: hoverColor,
    fragmentsHoverEdge: hoverEdge,
    fragmentsDraggingPoint: draggingPoint,
    enableAndArmFragmentsMeasure,
    exitFragmentsMeasureMode,
    clearFragmentsMeasurement,
    removeFragmentsMeasurement,
    registerFragmentsMeasureLabelEl,
    reprojectFragmentsMeasureOnFrame,
  };
}
