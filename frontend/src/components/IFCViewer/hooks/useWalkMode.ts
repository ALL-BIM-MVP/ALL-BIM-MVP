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

  
  const fragCollisionBusyRef = useRef(false);
  const fragFloorBusyRef = useRef(false);
  const lastAllowedDistanceRef = useRef(Infinity);
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

  // Arma una cámara "de mentira" parada en `from`, mirando en la
  // dirección (dirX, dirY, dirZ), y le pide a Fragments todo lo que
  // esa cámara ve con model.raycastAll(...) — confirmado en vivo que
  // esto SÍ funciona (a diferencia del intento anterior para el brazo
  // de profundidad de la cruz de ejes, que fallaba): la librería
  // arma un frustum chico a partir de la cámara y exige que choque con
  // model.box antes de buscar nada — con la cámara bien adentro de esa
  // caja (como es el caso acá: parada donde está el jugador, que
  // siempre está adentro del edificio) el chequeo se sostiene sin
  // problema. Lo que fallaba antes era una cámara pegada a una
  // superficie puntual, no "estar adentro de la geometría" en general.
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

    // mouse espera algo con propiedades x/y en píxeles de pantalla —
    // el centro del canvas, para que el rayo sea el de la cámara en
    // sí (NDC 0,0). Un Vector3 sirve igual de bien que un Vector2 acá,
    // solo se leen .x/.y.
    const mouse = new Vector3Ctor(canvas.width / 2, canvas.height / 2, 0);
    return model.raycastAll({ camera: fakeCam, mouse, dom: canvas });
  }, [rendererRef, canvasRef, storeRef]);

  // Versión "cacheada, no-bloqueante" para usar dentro de
  // updateWalkMovement (que corre síncrono cada frame). Dispara un
  // raycast nuevo si no hay uno en vuelo; mientras tanto, en vez de
  // confiar a ciegas en el último resultado conocido (que puede quedar
  // desactualizado si el jugador sigue caminando durante la ida y
  // vuelta real al worker — con sprint alcanzaba a "traspasar" una
  // pared fina en ese hueco), el margen cacheado se va GASTANDO con
  // cada frame que lo usa: cada vez que se avanza con un dato viejo, se
  // le resta esa misma distancia — así nunca se cruza más allá de lo
  // último confirmado libre, aunque el raycast tarde varios frames en
  // volver. Cuando el raycast fresco resuelve, pisa el valor gastado
  // con la medición real. Infinity (sin datos todavía, antes del
  // primer raycast) no se gasta — no hay nada que gastar sin haber
  // medido nunca.
  const checkWalkCollisionFragments = useCallback((
    from: { x: number; y: number; z: number }, dirX: number, dirZ: number, distance: number, radius: number
  ): number => {
    if (!fragCollisionBusyRef.current) {
      fragCollisionBusyRef.current = true;
      fragmentsRaycastAll(from, { x: dirX, y: 0, z: dirZ })
        .then((results) => {
          lastAllowedDistanceRef.current = results && results.length > 0
            ? Math.max(0, results[0].distance - radius)
            : Infinity;
        })
        .catch((err) => console.warn('[useWalkMode] error en colisión de Fragments:', err))
        .finally(() => { fragCollisionBusyRef.current = false; });
    }
    const allowed = Math.min(distance, lastAllowedDistanceRef.current);
    if (Number.isFinite(lastAllowedDistanceRef.current)) {
      lastAllowedDistanceRef.current = Math.max(0, lastAllowedDistanceRef.current - allowed);
    }
    return allowed;
  }, [fragmentsRaycastAll]);

  // Mismo criterio que ThreeSceneController.findFloorHeight (camino
  // web-ifc): con referenceY (a qué altura estás parado ahora), se
  // queda con el impacto del rayo MÁS CERCANO a esa altura (dentro de
  // maxDelta) en vez del primero de arriba hacia abajo — así, en un
  // edificio de varios pisos, no te "sube" solo al piso de arriba
  // porque el rayo (tirado desde bien arriba de todo el modelo) lo
  // encuentra primero. raycastAll ya trae TODOS los impactos a lo largo
  // del rayo, no solo el más cercano a la cámara — antes acá se usaba
  // directo results[0] (el más alto), que es lo que rompía esto.
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
            lastFloorYRef.current = results[0].point.y;
            return;
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
      const prevX = state.position.x;
      const prevZ = state.position.z;

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
          state.position.x = prevX;
          state.position.z = prevZ;
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
    // Acá SÍ conviene esperar el raycast real (una sola vez, no cada
    // frame) en vez de la versión cacheada — para arrancar parado en
    // el piso correcto desde el primer instante. referenceY (mismo
    // criterio que findFloorHeightFragments arriba, para no arrancar
    // parado en el piso de arriba en un edificio de varios pisos si la
    // cámara ya estaba mirando un piso más abajo antes de entrar).
    const findFloorHeightOnce = async (x: number, z: number, referenceY?: number): Promise<number | null> => {
      if (hasFragmentsModel) {
        const results = await fragmentsRaycastAll({ x, y: (renderer.getModelBounds?.()?.max.y ?? 0) + 5, z }, { x: 0, y: -1, z: 0 });
        if (!results || results.length === 0) return null;
        if (referenceY === undefined) return results[0].point.y;
        let best = results[0];
        let bestDiff = Math.abs(best.point.y - referenceY);
        for (const r of results) {
          const diff = Math.abs(r.point.y - referenceY);
          if (diff < bestDiff) { best = r; bestDiff = diff; }
        }
        return bestDiff <= 2.5 ? best.point.y : results[0].point.y;
      }
      return renderer.findFloorHeight?.(x, z, referenceY) ?? renderer.findFloorHeight?.(x, z) ?? null;
    };

    let startX = 0;
    let startZ = 0;
    let camY: number | undefined;
    let haveStartXZ = false;

    const camera = renderer.getCamera?.();
    const camPos = camera?.camera?.position;
    const targetPos = camera?.target;
    if (camPos) {
      startX = camPos.x;
      startZ = camPos.z;
      haveStartXZ = true;
    }
    camY = targetPos?.y ?? camPos?.y;

    if (!haveStartXZ) {
      const bounds = renderer.getModelBounds?.();
      if (bounds) {
        startX = (bounds.min.x + bounds.max.x) / 2;
        startZ = (bounds.min.z + bounds.max.z) / 2;
        haveStartXZ = true;
      }
    }

    let startY: number;
    let floorY: number | null = null;
    if (haveStartXZ) {
      floorY = hasFragmentsModel
        ? await findFloorHeightOnce(startX, startZ, camY)
        : (renderer.findFloorHeight?.(startX, startZ, camY) ?? renderer.findFloorHeight?.(startX, startZ) ?? null);
    }

    if (floorY === null) {
      const bounds = renderer.getModelBounds?.();
      if (bounds) {
        const clampedX = Math.max(bounds.min.x, Math.min(bounds.max.x, startX));
        const clampedZ = Math.max(bounds.min.z, Math.min(bounds.max.z, startZ));
        const retryFloor = await findFloorHeightOnce(clampedX, clampedZ);
        if (retryFloor !== null) {
          startX = clampedX;
          startZ = clampedZ;
          floorY = retryFloor;
        }
      }
    }

    if (floorY !== null) {
      startY = floorY + EYE_HEIGHT;
    } else {
      const bounds = renderer.getModelBounds?.();
      startY = (bounds ? bounds.max.y : 0) + EYE_HEIGHT;
    }

    walkStateRef.current.position = { x: startX, y: startY, z: startZ };
    walkStateRef.current.yaw = 0;
    walkStateRef.current.pitch = 0;
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
