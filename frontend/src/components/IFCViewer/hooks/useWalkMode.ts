import { useState, useRef, useEffect, useCallback } from 'react';

const EYE_HEIGHT = 1.7;
const COLLISION_RADIUS = 0.28;
const WALK_SPEED = 3;
const SPRINT_MULTIPLIER = 1.8;
const FLOOR_FOLLOW_SPEED = 20;
const COLLISION_CHECK_HEIGHT = 0.4;
const BOUNDS_MARGIN = 1;

export function useWalkMode(
  rendererRef: React.RefObject<any>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,

  storeRef?: React.RefObject<any>
) {
  const [isWalkMode, setIsWalkMode] = useState(false);
  const isWalkModeRef = useRef(false);
  const walkStateRef = useRef({ position: { x: 0, y: EYE_HEIGHT, z: 0 }, yaw: 0, pitch: 0 });
  const keysPressedRef = useRef<Set<string>>(new Set());
  const [isPointerLocked, setIsPointerLocked] = useState(false);


  interface DirCollisionCache { busy: boolean; allowed: number; }
  const dirCollisionCachesRef = useRef(new Map<string, DirCollisionCache>());
  const dirCollisionKey = (dirX: number, dirZ: number): string => {
    const angleDeg = Math.atan2(dirZ, dirX) * (180 / Math.PI);
    return String(Math.round(angleDeg / 15) * 15);
  };
  const fragFloorBusyRef = useRef(false);
  const lastFloorYRef = useRef<number | null>(null);

  useEffect(() => { isWalkModeRef.current = isWalkMode; }, [isWalkMode]);

  useEffect(() => {
    const handleChange = () => setIsPointerLocked(document.pointerLockElement === canvasRef.current);
    document.addEventListener('pointerlockchange', handleChange);
    return () => document.removeEventListener('pointerlockchange', handleChange);
  }, [canvasRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isWalkModeRef.current) return;
      keysPressedRef.current.add(e.key.toLowerCase());
    };
    const handleKeyUp = (e: KeyboardEvent) => keysPressedRef.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  
  const fragmentsRaycastAll = useCallback(async (
    from: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number }
  ): Promise<{ point: { x: number; y: number; z: number }; distance: number }[] | null> => {
    const model = storeRef?.current?.fragmentsModel;
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    const realCamera = renderer?.getCamera?.()?.camera;
    if (!model || !realCamera || !canvas) return null;

    const CameraCtor = Object.getPrototypeOf(realCamera).constructor;
    const Vector3Ctor = realCamera.position.constructor;
    const fakeCam = new CameraCtor(realCamera.fov, canvas.width / canvas.height, 0.01, 1000);
    fakeCam.position.set(from.x, from.y, from.z);
    fakeCam.lookAt(new Vector3Ctor(from.x + dir.x, from.y + dir.y, from.z + dir.z));
    fakeCam.updateMatrixWorld(true);
    fakeCam.updateProjectionMatrix();

    
    const rect = canvas.getBoundingClientRect();
    const mouse = new Vector3Ctor(rect.left + rect.width / 2, rect.top + rect.height / 2, 0);
    return model.raycastAll({ camera: fakeCam, mouse, dom: canvas });
  }, [rendererRef, canvasRef, storeRef]);


  // gastar sin haber medido nunca.
  const checkWalkCollisionFragments = useCallback((
    from: { x: number; y: number; z: number }, dirX: number, dirZ: number, distance: number, radius: number
  ): number => {
    const key = dirCollisionKey(dirX, dirZ);
    let cache = dirCollisionCachesRef.current.get(key);
    if (!cache) {
      cache = { busy: false, allowed: Infinity };
      dirCollisionCachesRef.current.set(key, cache);
    }

    if (!cache.busy) {
      cache.busy = true;
      fragmentsRaycastAll(from, { x: dirX, y: 0, z: dirZ })
        .then((results) => {
   
          if (results && results.length > 0) {
            let nearest = (results[0] as any).rayDistance ?? results[0].distance;
            for (const r of results) {
              const d = (r as any).rayDistance ?? r.distance;
              if (d < nearest) nearest = d;
            }
            cache!.allowed = Math.max(0, nearest - radius);
          } else {
            cache!.allowed = Infinity;
          }
        })
        .catch((err) => console.warn('[useWalkMode] error en colisión de Fragments:', err))
        .finally(() => { cache!.busy = false; });
    }

    const allowed = Math.min(distance, cache.allowed);
    if (Number.isFinite(cache.allowed)) {
      cache.allowed = Math.max(0, cache.allowed - allowed);
    }
    return allowed;
  }, [fragmentsRaycastAll]);

  const findFloorHeightFragments = useCallback((
    x: number, z: number, referenceY?: number, maxDelta = 2.5
  ): number | null => {
    const bounds = rendererRef.current?.getModelBounds?.();
    if (!bounds) return lastFloorYRef.current;

    if (!fragFloorBusyRef.current) {
      fragFloorBusyRef.current = true;
      const fromY = bounds.max.y + 5;
      fragmentsRaycastAll({ x, y: fromY, z }, { x: 0, y: -1, z: 0 })
        .then((results) => {
          if (!results || results.length === 0) {
            lastFloorYRef.current = null;
            return;
          }
          if (referenceY === undefined) {
        
            let nearest = results[0];
            let nearestDist = (results[0] as any).rayDistance ?? results[0].distance;
            for (const r of results) {
              const d = (r as any).rayDistance ?? r.distance;
              if (d < nearestDist) { nearest = r; nearestDist = d; }
            }
            lastFloorYRef.current = nearest.point.y;
            return;
          }

         
          const prevFloorY = lastFloorYRef.current;
          if (prevFloorY !== null) {
            const stillThere = results.find((r) => Math.abs(r.point.y - prevFloorY) < 0.1);
            if (stillThere) {
              lastFloorYRef.current = stillThere.point.y;
              return;
            }
          }

          let best = results[0];
          let bestDiff = Math.abs(best.point.y - referenceY);
          for (const r of results) {
            const diff = Math.abs(r.point.y - referenceY);
            if (diff < bestDiff) { best = r; bestDiff = diff; }
          }
          lastFloorYRef.current = bestDiff <= maxDelta ? best.point.y : null;
        })
        .catch((err) => console.warn('[useWalkMode] error en piso de Fragments:', err))
        .finally(() => { fragFloorBusyRef.current = false; });
    }
    return lastFloorYRef.current;
  }, [rendererRef, fragmentsRaycastAll]);

  const updateWalkMovement = useCallback((dt: number) => {
    if (!isWalkModeRef.current) return;
    if (document.pointerLockElement !== canvasRef.current) return;

    const renderer = rendererRef.current;
    const camera = renderer?.getCamera?.();
    if (!camera) return;

    const hasFragmentsModel = !!storeRef?.current?.fragmentsModel;
    const collisionFn = hasFragmentsModel
      ? checkWalkCollisionFragments
      : (typeof renderer.checkWalkCollision === 'function' ? renderer.checkWalkCollision.bind(renderer) : null);
    const floorFn = hasFragmentsModel
      ? findFloorHeightFragments
      : (typeof renderer.findFloorHeight === 'function' ? renderer.findFloorHeight.bind(renderer) : null);

    const keys = keysPressedRef.current;
    const state = walkStateRef.current;
    const speed = keys.has('shift') ? WALK_SPEED * SPRINT_MULTIPLIER : WALK_SPEED;

    const forwardX = Math.sin(state.yaw);
    const forwardZ = -Math.cos(state.yaw);
    const rightX = Math.cos(state.yaw);
    const rightZ = Math.sin(state.yaw);

    let moveX = 0, moveZ = 0;
    if (keys.has('w') || keys.has('arrowup')) { moveX += forwardX; moveZ += forwardZ; }
    if (keys.has('s') || keys.has('arrowdown')) { moveX -= forwardX; moveZ -= forwardZ; }
    if (keys.has('a') || keys.has('arrowleft')) { moveX -= rightX; moveZ -= rightZ; }
    if (keys.has('d') || keys.has('arrowright')) { moveX += rightX; moveZ += rightZ; }

    const len = Math.hypot(moveX, moveZ);
    if (len > 0) {
      const dirNormX = moveX / len;
      const dirNormZ = moveZ / len;
      const desiredDistance = speed * dt;

      const getCollisionOrigin = () => ({
        x: state.position.x,
        y: state.position.y - EYE_HEIGHT + COLLISION_CHECK_HEIGHT,
        z: state.position.z,
      });

      if (collisionFn) {
        const allowedDiagonal = collisionFn(
          getCollisionOrigin(), dirNormX, dirNormZ, desiredDistance, COLLISION_RADIUS
        );

        if (allowedDiagonal >= desiredDistance - 1e-6) {
          state.position.x += dirNormX * desiredDistance;
          state.position.z += dirNormZ * desiredDistance;
        } else {
          const stepX = dirNormX * desiredDistance;
          const stepZ = dirNormZ * desiredDistance;

          if (stepX !== 0) {
            const dirX = stepX > 0 ? 1 : -1;
            const allowedX = collisionFn(getCollisionOrigin(), dirX, 0, Math.abs(stepX), COLLISION_RADIUS);
            state.position.x += allowedX * dirX;
          }
          if (stepZ !== 0) {
            const dirZ = stepZ > 0 ? 1 : -1;
            const allowedZ = collisionFn(getCollisionOrigin(), 0, dirZ, Math.abs(stepZ), COLLISION_RADIUS);
            state.position.z += allowedZ * dirZ;
          }
        }
      } else {
        state.position.x += dirNormX * desiredDistance;
        state.position.z += dirNormZ * desiredDistance;
      }

      const bounds = renderer.getModelBounds?.();
      if (bounds) {
        state.position.x = Math.max(bounds.min.x - BOUNDS_MARGIN, Math.min(bounds.max.x + BOUNDS_MARGIN, state.position.x));
        state.position.z = Math.max(bounds.min.z - BOUNDS_MARGIN, Math.min(bounds.max.z + BOUNDS_MARGIN, state.position.z));
      }

      if (floorFn) {
        // Mismo referenceY para los dos caminos ahora — findFloorHeightFragments
        // ya sabe usarlo igual que la versión de web-ifc (ver el comentario ahí).
        const currentFloorY = state.position.y - EYE_HEIGHT;
        const floorY = floorFn(state.position.x, state.position.z, currentFloorY);
        if (floorY === null) {
          // Sin piso confirmado cerca de la altura actual (típico recién
          // entrando a modo caminar, si arrancaste a la altura exacta de
          // la cámara orbital y esa altura no coincide con ningún piso
          // real) — antes esto revertía el movimiento X/Z entero,
          // dejándote bloqueado ahí para siempre. Ahora se deja avanzar
          // igual (sin ajustar la altura todavía); apenas te acerques lo
          // suficiente a un piso real, la rama de abajo lo engancha.
        } else {
          const targetY = floorY + EYE_HEIGHT;
          state.position.y += (targetY - state.position.y) * Math.min(1, FLOOR_FOLLOW_SPEED * dt);
        }
      }
    }

    const lookDist = 5;
    const targetX = state.position.x + Math.sin(state.yaw) * Math.cos(state.pitch) * lookDist;
    const targetY = state.position.y + Math.sin(state.pitch) * lookDist;
    const targetZ = state.position.z - Math.cos(state.yaw) * Math.cos(state.pitch) * lookDist;

    camera.setPosition(state.position.x, state.position.y, state.position.z);
    camera.setTarget(targetX, targetY, targetZ);
  }, [rendererRef, canvasRef, storeRef, checkWalkCollisionFragments, findFloorHeightFragments]);

  const enterWalkMode = useCallback(async () => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;

    const hasFragmentsModel = !!storeRef?.current?.fragmentsModel;

    const camera = renderer.getCamera?.();
    const camPos = camera?.camera?.position;
    const targetPos = camera?.target;

    let startX: number, startY: number, startZ: number;
    let startYaw = 0, startPitch = 0;

    if (camPos) {
      // Pedido explícito: al entrar a modo caminar hay que aparecer
      // EXACTAMENTE donde estaba parada la cámara orbital (mismo x/y/z),
      // no ajustado al piso más cercano — antes se usaba x/z de la
      // cámara pero se recalculaba la altura buscando el piso debajo,
      // así que casi nunca aparecías realmente "ahí mismo".
      startX = camPos.x;
      startY = camPos.y;
      startZ = camPos.z;

      // De paso, mirar hacia el mismo lado que la cámara orbital
      // (hacia su target) en vez de resetear a una dirección fija —
      // si no, aparecés en el lugar correcto pero mirando para
      // cualquier lado.
      if (targetPos) {
        const dirX = targetPos.x - camPos.x;
        const dirY = targetPos.y - camPos.y;
        const dirZ = targetPos.z - camPos.z;
        const len3 = Math.hypot(dirX, dirY, dirZ);
        if (len3 > 1e-6) {
          startYaw = Math.atan2(dirX, -dirZ);
          startPitch = Math.max(-1.4, Math.min(1.4, Math.asin(dirY / len3)));
        }
      }
    } else {
      // Sin cámara disponible (no debería pasar en uso normal): mismo
      // fallback de siempre, al piso más alto del modelo.
      const bounds = renderer.getModelBounds?.();
      const centerX = bounds ? (bounds.min.x + bounds.max.x) / 2 : 0;
      const centerZ = bounds ? (bounds.min.z + bounds.max.z) / 2 : 0;
      const floorY = hasFragmentsModel
        ? await fragmentsRaycastAll({ x: centerX, y: (bounds?.max.y ?? 0) + 5, z: centerZ }, { x: 0, y: -1, z: 0 })
          .then((r) => (r && r.length > 0 ? r[0].point.y : null))
        : (renderer.findFloorHeight?.(centerX, centerZ) ?? null);
      startX = centerX;
      startZ = centerZ;
      startY = (floorY ?? bounds?.max.y ?? 0) + EYE_HEIGHT;
    }

    walkStateRef.current.position = { x: startX, y: startY, z: startZ };
    walkStateRef.current.yaw = startYaw;
    walkStateRef.current.pitch = startPitch;
    setIsWalkMode(true);
  }, [rendererRef, canvasRef, storeRef, fragmentsRaycastAll]);

  const toggleWalkMode = useCallback(() => {
    setIsWalkMode(prev => {
      const next = !prev;
      if (next) enterWalkMode();
      else document.exitPointerLock?.();
      return next;
    });
  }, [enterWalkMode]);


  const toggleWalkPause = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (document.pointerLockElement === canvas) {
      document.exitPointerLock();
      const renderer = rendererRef.current;
      const camera = renderer?.getCamera?.();
      const state = walkStateRef.current;
      camera?.setFromWalkState?.(state.position, state.yaw, state.pitch);
    } else {
      canvas.requestPointerLock?.();
    }
  }, [canvasRef, rendererRef]);

  const isWalkPaused = isWalkMode && !isPointerLocked;

  useEffect(() => {
    const handleSpace = (e: KeyboardEvent) => {
      if (!isWalkModeRef.current) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggleWalkPause();
      }
    };
    window.addEventListener('keydown', handleSpace);
    return () => window.removeEventListener('keydown', handleSpace);
  }, [toggleWalkPause]);

  return {
    isWalkMode,
    isWalkModeRef,
    walkStateRef,
    toggleWalkMode,
    updateWalkMovement,
    isWalkPaused,
    toggleWalkPause,
  };
}
