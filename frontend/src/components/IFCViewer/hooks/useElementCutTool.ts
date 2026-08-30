import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { cameraOrCanvasChanged, type CameraSnapshot } from '../utils/cameraChangeDetector';

interface Vec3 { x: number; y: number; z: number; }
interface ScreenPos { x: number; y: number; }

const GRAB_HIT_RADIUS = 18;
const MAX_OFFSET = 20;

// El punto de origen + normal para armar el corte es lo ÚNICO que
// depende de qué camino cargó el modelo (web-ifc vs Fragments) — todo
// lo demás acá (arrastrar, calcular el offset, el plano de recorte)
// es matemática genérica sobre esos dos vectores, y
// ThreeSceneController.applyClipPlane ya recorre TODO modelGroup (que
// incluye tanto las mallas de siempre como el model.object de
// Fragments — ver controller.addExternalObject en useModelLoader.ts),
// así que el recorte visual funciona para los dos caminos sin tocar
// nada de renderizado. Por eso este hook, a diferencia de los otros de
// Fase 3, NO tiene un "useFragmentsElementCutTool" aparte — alcanza con
// que armCutAt sepa de dónde sacar el punto+normal.
export function useElementCutTool(
  rendererRef: React.RefObject<any>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  storeRef?: React.RefObject<any>
) {
  const [armed, setArmed] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [origin, setOrigin] = useState<Vec3 | null>(null);
  const [normal, setNormal] = useState<Vec3 | null>(null);
  const [offset, setOffset] = useState(0);
  const [scissorsScreen, setScissorsScreen] = useState<ScreenPos | null>(null);
  const [dragging, setDragging] = useState(false);

  const armedRef = useRef(false);
  const draggingRef = useRef(false);
  const enabledRef = useRef(false);
  const originRef = useRef<Vec3 | null>(null);
  const normalRef = useRef<Vec3 | null>(null);
  const offsetRef = useRef(0);
  const scissorsScreenRef = useRef<ScreenPos | null>(null);
  const dragStartScreenRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartOffsetRef = useRef(0);
  const lastCameraSnapshotRef = useRef<CameraSnapshot | null>(null);

  useEffect(() => { armedRef.current = armed; }, [armed]);
  useEffect(() => { draggingRef.current = dragging; }, [dragging]);
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { originRef.current = origin; }, [origin]);
  useEffect(() => { normalRef.current = normal; }, [normal]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  useEffect(() => { scissorsScreenRef.current = scissorsScreen; }, [scissorsScreen]);

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

  const armCutAt = useCallback(async (cssX: number, cssY: number) => {
    const renderer = rendererRef.current;
    const model = storeRef?.current?.fragmentsModel;
    const canvas = canvasRef.current;

    let hit: { point: Vec3; normal: Vec3 } | null = null;
    if (model && canvas) {
   
      const cameraController = renderer?.getCamera?.();
      const camera = cameraController?.camera;
      if (camera) {
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(rect.left + cssX, rect.top + cssY);
        try {
          const result = await model.raycast({ camera, mouse, dom: canvas });
          if (result?.point && result?.normal) {
            hit = {
              point: { x: result.point.x, y: result.point.y, z: result.point.z },
              normal: { x: result.normal.x, y: result.normal.y, z: result.normal.z },
            };
          }
        } catch (err) {
          console.warn('[useElementCutTool] error en raycast de Fragments:', err);
        }
      }
    } else if (renderer?.raycastSurfacePoint) {
      hit = renderer.raycastSurfacePoint(cssX, cssY);
    }
    if (!hit) return;

    setOrigin(hit.point);
    setNormal(hit.normal);
    setOffset(0);
    setEnabled(true);
    setArmed(true);
    const screenPos = projectPoint(hit.point);
    setScissorsScreen(screenPos);
    scissorsScreenRef.current = screenPos;
  }, [rendererRef, canvasRef, storeRef, projectPoint]);

  const exitCut = useCallback(() => {
    setArmed(false);
    setEnabled(false);
    setDragging(false);
    setOrigin(null);
    setNormal(null);
    setOffset(0);
    setScissorsScreen(null);
    scissorsScreenRef.current = null;
    dragStartScreenRef.current = null;
  }, []);

  const pixelsToWorldOffset = useCallback((dxScreen: number, dyScreen: number): number => {
    const o = originRef.current;
    const n = normalRef.current;
    if (!o || !n) return 0;

    const nearScreen = projectPoint(o);
    const nudge = 0.05;
    const farPoint = { x: o.x + n.x * nudge, y: o.y + n.y * nudge, z: o.z + n.z * nudge };
    const farScreen = projectPoint(farPoint);
    if (!nearScreen || !farScreen) return 0;

    const dirX = farScreen.x - nearScreen.x;
    const dirY = farScreen.y - nearScreen.y;
    const dirLenSq = dirX * dirX + dirY * dirY;
    if (dirLenSq < 1e-6) return 0;

    const dragAlongDir = (dxScreen * dirX + dyScreen * dirY) / Math.sqrt(dirLenSq);
    const worldPerScreenPx = nudge / Math.sqrt(dirLenSq);
    return dragAlongDir * worldPerScreenPx;
  }, [projectPoint]);

  const hitTestScissors = useCallback((clientX: number, clientY: number): boolean => {
    const screenPos = scissorsScreenRef.current;
    if (!screenPos) return false;
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    return Math.hypot(screenPos.x - localX, screenPos.y - localY) <= GRAB_HIT_RADIUS;
  }, [canvasRef]);

  const handleCutMouseDown = useCallback((clientX: number, clientY: number): boolean => {
    if (!armedRef.current) return false;
    if (!hitTestScissors(clientX, clientY)) return false;

    setDragging(true);
    dragStartScreenRef.current = { x: clientX, y: clientY };
    dragStartOffsetRef.current = offsetRef.current;
    return true;
  }, [hitTestScissors]);

  const handleCutMouseMove = useCallback((clientX: number, clientY: number): boolean => {
    if (!draggingRef.current) return false;
    
    const start = dragStartScreenRef.current;
    if (start) {
      const dx = clientX - start.x;
      const dy = clientY - start.y;
      const worldDelta = pixelsToWorldOffset(dx, dy);
      const nextOffset = dragStartOffsetRef.current + worldDelta;
      const clampedOffset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, nextOffset));
      
      setOffset(clampedOffset);
      setEnabled(true);
      
      const o = originRef.current;
      const n = normalRef.current;
      if (o && n) {
        const displayPoint = {
          x: o.x + n.x * clampedOffset,
          y: o.y + n.y * clampedOffset,
          z: o.z + n.z * clampedOffset,
        };
        const screenPos = projectPoint(displayPoint);
        setScissorsScreen(screenPos);
        scissorsScreenRef.current = screenPos;
      }
    }
    return true;
  }, [pixelsToWorldOffset, projectPoint]);

  const handleCutMouseUp = useCallback((): boolean => {
    if (!draggingRef.current) return false;
    setDragging(false);
    dragStartScreenRef.current = null;
    return true;
  }, []);

  const reprojectOnFrame = useCallback(() => {
    if (!armedRef.current || draggingRef.current) return;
    const o = originRef.current;
    const n = normalRef.current;
    if (!o || !n) return;
    
    if (!cameraOrCanvasChanged(rendererRef.current, canvasRef.current, lastCameraSnapshotRef)) return;
    const displayPoint = { x: o.x + n.x * offsetRef.current, y: o.y + n.y * offsetRef.current, z: o.z + n.z * offsetRef.current };
    const screenPos = projectPoint(displayPoint);
    setScissorsScreen(screenPos);
    scissorsScreenRef.current = screenPos;
  }, [projectPoint, rendererRef, canvasRef]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && armedRef.current) exitCut();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [exitCut]);

  const getSectionPlane = useCallback(() => {
    if (!enabledRef.current || !originRef.current || !normalRef.current) return undefined;
    return { kind: 'element' as const, origin: originRef.current, normal: normalRef.current, offset: offsetRef.current, enabled: true };
  }, []);

  return {
    cutArmed: armed,
    cutEnabled: enabled,
    cutDragging: dragging,
    scissorsScreen,
    armCutAt,
    exitCut,
    handleCutMouseDown,
    handleCutMouseMove,
    handleCutMouseUp,
    reprojectOnFrame,
    getSectionPlane,
  };
}