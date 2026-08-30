
import { useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { coplanarTrianglesFromMesh, computeCrossArms, clipArmTipForScreen } from '../utils/crossMath';
import { cameraOrCanvasChanged, type CameraSnapshot } from '../utils/cameraChangeDetector';

interface Vec3 { x: number; y: number; z: number; }
interface ScreenPos { x: number; y: number; }

export interface FragCrossEntry {
  id: string;
  center: Vec3; normal: Vec3;
  uPos: Vec3; uNeg: Vec3; vPos: Vec3; vNeg: Vec3;
  
  depthPos: Vec3 | null;
  centerScreen: ScreenPos | null;
  uPosScreen: ScreenPos | null; uNegScreen: ScreenPos | null;
  vPosScreen: ScreenPos | null; vNegScreen: ScreenPos | null;
  depthPosScreen: ScreenPos | null;
}

const DRAG_HIT_RADIUS = 14; // mismo radio que useCrossTool.ts
const CROSS_THROTTLE_MS = 32;

function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

let idCounter = 0;
const nextId = () => `fragcross_${++idCounter}`;


async function buildTempMeshForItem(model: any, localId: number, modelWorldMatrix: THREE.Matrix4): Promise<THREE.Mesh | null> {
  const [pieces] = await model.getItemsGeometry([localId]);
  if (!pieces || pieces.length === 0) return null;

  const positions: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;
  const v = new THREE.Vector3();

  for (const piece of pieces) {
    if (!piece.positions || !piece.indices) continue;
    const pieceMatrix = modelWorldMatrix.clone().multiply(piece.transform as THREE.Matrix4);
    const count = piece.positions.length / 3;
    for (let i = 0; i < count; i++) {
      v.set(piece.positions[i * 3], piece.positions[i * 3 + 1], piece.positions[i * 3 + 2]);
      v.applyMatrix4(pieceMatrix);
      positions.push(v.x, v.y, v.z);
    }
    for (let i = 0; i < piece.indices.length; i++) {
      indices.push(piece.indices[i] + vertexOffset);
    }
    vertexOffset += count;
  }
  if (positions.length === 0 || indices.length === 0) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(geometry);

  mesh.matrixAutoUpdate = false;
  return mesh;
}

export function useFragmentsCrossTool(
  rendererRef: React.RefObject<any>,
  storeRef: React.RefObject<any>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const [crossMode, setCrossMode] = useState(false);
  const [armed, setArmed] = useState(false);
  const [crosses, setCrosses] = useState<FragCrossEntry[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const crossModeRef = useRef(false);
  const armedRef = useRef(false);
  const crossesRef = useRef<FragCrossEntry[]>([]);
  const draggingIdRef = useRef<string | null>(null);
  const lastCameraSnapshotRef = useRef<CameraSnapshot | null>(null);
  const busyRef = useRef(false);
  // Cache de mallas temporales por localId — mientras se arrastra sobre
  // el MISMO elemento no hace falta volver a pedir la geometría en
  // cada mousemove.
  const meshCacheRef = useRef(new Map<number, THREE.Mesh>());

  const posElsRef = useRef(new Map<string, HTMLElement>());
  const registerFragmentsCrossPosEl = useCallback((key: string, el: HTMLElement | null) => {
    if (el) posElsRef.current.set(key, el);
    else posElsRef.current.delete(key);
  }, []);

  useEffect(() => { crossModeRef.current = crossMode; }, [crossMode]);
  useEffect(() => { armedRef.current = armed; }, [armed]);
  useEffect(() => { crossesRef.current = crosses; }, [crosses]);
  useEffect(() => { draggingIdRef.current = draggingId; }, [draggingId]);
  useEffect(() => {
    if (!crossMode) {
      setCrosses([]);
      setDraggingId(null);
      setArmed(false);
      meshCacheRef.current.clear();
    }
  }, [crossMode]);

  const enableAndArmFragmentsCross = useCallback(() => { setCrossMode(true); setArmed(true); }, []);
  const exitFragmentsCrossMode = useCallback(() => setCrossMode(false), []);
  const clearFragmentsCross = useCallback(() => { setCrosses([]); setDraggingId(null); }, []);
  const removeFragmentsCross = useCallback((id: string) => {
    setCrosses((prev) => prev.filter((c) => c.id !== id));
    if (draggingIdRef.current === id) setDraggingId(null);
  }, []);

 
  const projectPoint = useCallback((point: Vec3, center?: Vec3): ScreenPos | null => {
    const renderer = rendererRef.current;
    const cameraController = renderer?.getCamera?.();
    const canvas = canvasRef.current;
    if (!cameraController || !canvas || typeof cameraController.projectToScreen !== 'function') return null;
    try {
      let target: Vec3 = point;
      if (center && cameraController.camera instanceof THREE.PerspectiveCamera) {
        const clipped = clipArmTipForScreen(
          cameraController.camera,
          new THREE.Vector3(center.x, center.y, center.z),
          new THREE.Vector3(point.x, point.y, point.z)
        );
        target = { x: clipped.x, y: clipped.y, z: clipped.z };
      }
      const raw = cameraController.projectToScreen(target, canvas.width, canvas.height);
      if (!raw) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return { x: raw.x / scaleX, y: raw.y / scaleY };
    } catch {
      return null;
    }
  }, [rendererRef, canvasRef]);

  const withScreen = useCallback((data: Omit<FragCrossEntry, 'id' | 'centerScreen' | 'uPosScreen' | 'uNegScreen' | 'vPosScreen' | 'vNegScreen' | 'depthPosScreen'>, id: string): FragCrossEntry => ({
    ...data,
    id,
    centerScreen: projectPoint(data.center),
    uPosScreen: projectPoint(data.uPos, data.center),
    uNegScreen: projectPoint(data.uNeg, data.center),
    vPosScreen: projectPoint(data.vPos, data.center),
    vNegScreen: projectPoint(data.vNeg, data.center),
    depthPosScreen: data.depthPos ? projectPoint(data.depthPos, data.center) : null,
  }), [projectPoint]);


  const computeCrossAt = useCallback(async (
    clientX: number, clientY: number, id: string, fast: boolean, recenter: boolean
  ): Promise<FragCrossEntry | null> => {
    const model = storeRef.current?.fragmentsModel;
    const cameraController = rendererRef.current?.getCamera?.();
    const camera = cameraController?.camera;
    const canvas = canvasRef.current;
    if (!model || !camera || !canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pxX = (clientX - rect.left) * scaleX;
    const pxY = (clientY - rect.top) * scaleY;
    const ndc = new THREE.Vector2((pxX / canvas.width) * 2 - 1, -(pxY / canvas.height) * 2 + 1);

    const mouse = new THREE.Vector2(clientX, clientY); // convención de model.raycast(...) — ver useFragmentsSelection.ts
    const fragHit = await model.raycast({ camera, mouse, dom: canvas });
    if (!fragHit) return null;
    const localId = fragHit.localId as number;

    let mesh = meshCacheRef.current.get(localId);
    if (!mesh) {
      const modelWorldMatrix = (model.object as THREE.Object3D).matrixWorld;
      const built = await buildTempMeshForItem(model, localId, modelWorldMatrix);
      if (!built) return null;
      mesh = built;
      meshCacheRef.current.set(localId, mesh);
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObject(mesh, false);
    const hit = hits.find((h) => h.faceIndex != null);
    if (!hit || hit.faceIndex == null) return null;

    const found = coplanarTrianglesFromMesh(mesh, hit.faceIndex, hit.point, null, fast);
    if (!found) return null;
    const arms = computeCrossArms(found.hitTriangle, found.triangles, hit.point.clone(), raycaster.ray.direction.clone(), recenter);


    let depthPos: Vec3 | null = null;
    if (!fast) {
      try {
        const DEPTH_OFFSET = 0.05; // 5cm hacia afuera antes de raycastear — ver comentario arriba
        const depthOrigin = arms.center.clone().addScaledVector(arms.normal, DEPTH_OFFSET);
        const fakeCam = new THREE.PerspectiveCamera(camera.fov, canvas.width / canvas.height, 0.01, 1000);
        fakeCam.position.copy(depthOrigin);
        fakeCam.lookAt(depthOrigin.clone().add(arms.normal));
        fakeCam.updateMatrixWorld(true);
        fakeCam.updateProjectionMatrix();
       
        const centerMouse = new THREE.Vector2(rect.left + rect.width / 2, rect.top + rect.height / 2);
        const depthHits = await model.raycastAll({ camera: fakeCam, mouse: centerMouse, dom: canvas });
        if (depthHits && depthHits.length > 0) {
          const rayDist = (h: any) => h.rayDistance ?? h.distance;
          const closest = [...depthHits].sort((a: any, b: any) => rayDist(a) - rayDist(b))[0];
          depthPos = { x: closest.point.x, y: closest.point.y, z: closest.point.z };
        }
      } catch (err) {
        console.warn('[useFragmentsCrossTool] error al calcular el brazo de profundidad:', err);
      }
    }

    const toVec3 = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
    return withScreen({
      center: toVec3(arms.center),
      normal: toVec3(arms.normal),
      uPos: toVec3(arms.uPos), uNeg: toVec3(arms.uNeg),
      vPos: toVec3(arms.vPos), vNeg: toVec3(arms.vNeg),
      depthPos,
    }, id);
  }, [rendererRef, storeRef, canvasRef, withScreen]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const hitTestCenter = (clientX: number, clientY: number): string | null => {
      const rect = canvas.getBoundingClientRect();
      const localX = clientX - rect.left, localY = clientY - rect.top;
      let bestId: string | null = null;
      let bestDist = Infinity;
      for (const c of crossesRef.current) {
        if (!c.centerScreen) continue;
        const d = Math.hypot(c.centerScreen.x - localX, c.centerScreen.y - localY);
        if (d <= DRAG_HIT_RADIUS && d < bestDist) { bestDist = d; bestId = c.id; }
      }
      return bestId;
    };

    let lastMoveAt = 0;
    let lastDragClient: { x: number; y: number } | null = null;

    const onMouseDown = async (e: MouseEvent) => {
      if (!crossModeRef.current) return;

      const hitId = hitTestCenter(e.clientX, e.clientY);
      if (hitId) {
        lastDragClient = { x: e.clientX, y: e.clientY };
        setDraggingId(hitId);
        e.stopImmediatePropagation(); // no orbitar mientras se arrastra — mismo criterio que useFragmentsMeasureTool.ts
        return;
      }

      if (!armedRef.current) return;
      if (busyRef.current) return;
      e.stopImmediatePropagation();

      const id = nextId();
      busyRef.current = true;
      try {
        const next = await computeCrossAt(e.clientX, e.clientY, id, true, true);
        if (next) {
          setCrosses((prev) => [...prev, next]);
          lastDragClient = { x: e.clientX, y: e.clientY };
          setDraggingId(id);
          setArmed(false);
        }
      } catch (err) {
        console.warn('[useFragmentsCrossTool] error al colocar la cruz:', err);
      } finally {
        busyRef.current = false;
      }
    };

    const onWindowMouseMove = async (e: MouseEvent) => {
      const id = draggingIdRef.current;
      if (!id) return;
      e.stopImmediatePropagation();
      lastDragClient = { x: e.clientX, y: e.clientY };

      const now = performance.now();
      if (now - lastMoveAt < CROSS_THROTTLE_MS) return;
      lastMoveAt = now;
      if (busyRef.current) return;

      busyRef.current = true;
      try {
       
        const next = await computeCrossAt(e.clientX, e.clientY, id, false, false);
        if (next) setCrosses((prev) => prev.map((c) => (c.id === id ? next : c)));
      } catch (err) {
        console.warn('[useFragmentsCrossTool] error al arrastrar la cruz:', err);
      } finally {
        busyRef.current = false;
      }
    };

    const onWindowMouseUp = async (e: MouseEvent) => {
      const id = draggingIdRef.current;
      if (!id) return;
      e.stopImmediatePropagation();
      setDraggingId(null);

     
      const last = lastDragClient;
      if (!last || busyRef.current) return;
      busyRef.current = true;
      try {
        const settled = await computeCrossAt(last.x, last.y, id, false, false);
        if (settled) setCrosses((prev) => prev.map((c) => (c.id === id ? settled : c)));
      } catch (err) {
        console.warn('[useFragmentsCrossTool] error al asentar la cruz:', err);
      } finally {
        busyRef.current = false;
      }
    };

    canvas.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [computeCrossAt, canvasRef]);

  const reprojectFragmentsCrossOnFrame = useCallback(() => {
    if (!crossModeRef.current || crossesRef.current.length === 0) return;
    if (!cameraOrCanvasChanged(rendererRef.current, canvasRef.current, lastCameraSnapshotRef)) return;

    const draggingNow = draggingIdRef.current;
    const updated = crossesRef.current.map((c) => {
      if (c.id === draggingNow) return c;
      return {
        ...c,
        centerScreen: projectPoint(c.center),
        uPosScreen: projectPoint(c.uPos, c.center),
        uNegScreen: projectPoint(c.uNeg, c.center),
        vPosScreen: projectPoint(c.vPos, c.center),
        vNegScreen: projectPoint(c.vNeg, c.center),
        depthPosScreen: c.depthPos ? projectPoint(c.depthPos, c.center) : null,
      };
    });

    for (const c of updated) {
      const centerEl = posElsRef.current.get(`${c.id}:center`);
      if (centerEl && c.centerScreen) {
        centerEl.style.transform = `translate(${c.centerScreen.x}px, ${c.centerScreen.y}px)`;
      }
    }
    setCrosses(updated);
  }, [projectPoint, rendererRef, canvasRef]);

  const crossesWithLengths = crosses.map((c) => ({
    ...c,
    lengthU: dist3D(c.uNeg, c.uPos),
    lengthV: dist3D(c.vNeg, c.vPos),
    lengthDepth: c.depthPos ? dist3D(c.center, c.depthPos) : null,
  }));

  return {
    fragmentsCrossMode: crossMode,
    
    fragmentsCrossModeRef: crossModeRef,
    fragmentsCrossArmed: armed,
    fragmentsCrosses: crossesWithLengths,
    draggingFragmentsCrossId: draggingId,
    enableAndArmFragmentsCross,
    exitFragmentsCrossMode,
    clearFragmentsCross,
    removeFragmentsCross,
    registerFragmentsCrossPosEl,
    reprojectFragmentsCrossOnFrame,
  };
}
