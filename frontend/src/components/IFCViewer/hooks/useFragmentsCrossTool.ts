// Fase 3 de la migración a ThatOpen/Fragments — cruz de ejes para el
// camino de Fragments. A diferencia de selección/medición, ACÁ SÍ se
// reutiliza el algoritmo real de ThreeSceneController.raycastFaceCross
// (extraído a crossMath.ts) — no una reimplementación aparte. La razón
// por la que hace falta más que un cableado directo: ese algoritmo
// necesita un THREE.Mesh de verdad (posiciones + índices) para
// recorrer los triángulos coplanares y encontrar el contorno real de
// la cara — un modelo de Fragments no expone eso directo. Entonces:
//
//   1. model.raycast(...) (Fragments) para saber QUÉ elemento (localId)
//      está bajo el mouse.
//   2. model.getItemsGeometry([localId]) para traer su geometría cruda.
//   3. Se arma un THREE.Mesh "de un solo uso" con esa geometría (con
//      cache por localId, para no repedir esto en cada frame mientras
//      se arrastra sobre el MISMO elemento).
//   4. Un THREE.Raycaster de verdad contra ESA malla nada más, para
//      tener un faceIndex/hit.point en el formato que espera
//      crossMath.ts (el mismo que ya usa el camino web-ifc).
//   5. coplanarTrianglesFromMesh + computeCrossArms — mismo cálculo,
//      mismo resultado visual, para los dos caminos.
//
// El brazo de profundidad (perfora en dirección opuesta a la normal,
// busca el próximo elemento detrás) — SIN implementar. Dos intentos
// reales, cada uno con un motivo concreto y confirmado en vivo por el
// que no sirve, por si hace falta retomarlo más adelante:
//
//   1. model.object (el THREE.Object3D real ya metido en la escena —
//      ver controller.addExternalObject en useModelLoader.ts): parecía
//      la salida obvia, geometría de three.js de verdad sin pasar por
//      la API de Fragments. Pero sus BufferAttribute (position, index)
//      tienen `.array` undefined — confirmado en vivo — los datos
//      reales viven en el worker/GPU, no llegan al hilo principal.
//      Ningún raycast (ni el nativo de three.js, ni uno a mano
//      recorriendo triángulos) puede leer esa geometría.
//
//   2. model.raycastAll(...) de Fragments SÍ tiene acceso real a la
//      geometría, pero solo acepta cámara+mouse (pantalla), no un
//      origen/dirección arbitrarios. Se probó el truco de armar una
//      THREE.PerspectiveCamera temporal parada en el origen del rayo
//      que hace falta (en el centro de su viewport, NDC 0,0, el rayo
//      de una perspectiva sale siempre desde su propia posición en la
//      dirección que mira) — incluso corrigiendo el aspect ratio al
//      real del canvas, la propia librería (RaycastManager en
//      index.mjs) arma un frustum chico a partir de esa cámara y
//      chequea que choque con la caja del modelo ANTES de buscar nada;
//      con una cámara parada en un lugar tan atípico (adentro de la
//      geometría, mirando en cualquier dirección) ese chequeo no se
//      sostiene y no encuentra nada — confirmado en vivo, no una
//      sospecha.
//
// Sin una forma pública de tirar un rayo con origen/dirección
// arbitrarios contra geometría real, la única vía que quedaría es
// pedir con getItemsGeometry(...) la geometría de TODO el modelo (no
// solo el elemento clickeado) para intersectar a mano — impracticable
// sin un índice espacial para saber qué elementos pedir.
import { useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { coplanarTrianglesFromMesh, computeCrossArms } from '../utils/crossMath';
import { cameraOrCanvasChanged, type CameraSnapshot } from '../utils/cameraChangeDetector';

interface Vec3 { x: number; y: number; z: number; }
interface ScreenPos { x: number; y: number; }

export interface FragCrossEntry {
  id: string;
  center: Vec3; normal: Vec3;
  uPos: Vec3; uNeg: Vec3; vPos: Vec3; vNeg: Vec3;
  depthPos: null; // sin implementar — ver comentario largo al principio del archivo
  centerScreen: ScreenPos | null;
  uPosScreen: ScreenPos | null; uNegScreen: ScreenPos | null;
  vPosScreen: ScreenPos | null; vNegScreen: ScreenPos | null;
  depthPosScreen: null;
}

const DRAG_HIT_RADIUS = 14; // mismo radio que useCrossTool.ts
const CROSS_THROTTLE_MS = 32;

function dist3D(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

let idCounter = 0;
const nextId = () => `fragcross_${++idCounter}`;

// Arma un THREE.Mesh de un solo uso a partir de la geometría cruda que
// devuelve Fragments para un elemento — puede venir en varias "piezas"
// (MeshData), cada una con su propia matriz de transformación; se
// mergea todo en una sola malla con las posiciones ya llevadas a
// espacio de mundo, así coplanarTrianglesFromMesh puede usarla con
// matrixWorld identidad, igual que si fuera una malla cualquiera de la
// escena.
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
  // Las posiciones ya están en espacio de mundo (se les aplicó
  // modelWorldMatrix * piece.transform arriba) — matrixWorld identidad
  // para que coplanarTrianglesFromMesh no las transforme una segunda vez.
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

  const withScreen = useCallback((data: Omit<FragCrossEntry, 'id' | 'centerScreen' | 'uPosScreen' | 'uNegScreen' | 'vPosScreen' | 'vNegScreen' | 'depthPosScreen'>, id: string): FragCrossEntry => ({
    ...data,
    id,
    centerScreen: projectPoint(data.center),
    uPosScreen: projectPoint(data.uPos),
    uNegScreen: projectPoint(data.uNeg),
    vPosScreen: projectPoint(data.vPos),
    vNegScreen: projectPoint(data.vNeg),
    depthPosScreen: null,
  }), [projectPoint]);

  // Corazón de la herramienta — ver el comentario largo al principio
  // del archivo para el paso a paso. fast/recenter tienen exactamente
  // el mismo significado que en useCrossTool.ts/raycastFaceCross.
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

    const toVec3 = (v: THREE.Vector3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
    return withScreen({
      center: toVec3(arms.center),
      normal: toVec3(arms.normal),
      uPos: toVec3(arms.uPos), uNeg: toVec3(arms.uNeg),
      vPos: toVec3(arms.vPos), vNeg: toVec3(arms.vNeg),
      depthPos: null, // sin implementar — ver comentario largo al principio del archivo
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
        // fast=false, recenter=false — mismo motivo que useCrossTool.ts:
        // sigue al mouse en vivo, y se queda donde se soltó (ver
        // onWindowMouseUp, que también usa recenter=false).
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

      // recenter=false, igual que durante el arrastre: la cruz queda
      // exactamente donde se soltó, no salta al centro de la cara.
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
        uPosScreen: projectPoint(c.uPos),
        uNegScreen: projectPoint(c.uNeg),
        vPosScreen: projectPoint(c.vPos),
        vNegScreen: projectPoint(c.vNeg),
        depthPosScreen: null,
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
    // Igual que fragmentsMeasureModeRef en useFragmentsMeasureTool.ts —
    // para que useFragmentsSelection.ts pueda leerlo sincrónicamente
    // desde su propio listener nativo de 'click'.
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
