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
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const [isWalkMode, setIsWalkMode] = useState(false);
  const isWalkModeRef = useRef(false);
  const walkStateRef = useRef({ position: { x: 0, y: EYE_HEIGHT, z: 0 }, yaw: 0, pitch: 0 });
  const keysPressedRef = useRef<Set<string>>(new Set());
  const [isPointerLocked, setIsPointerLocked] = useState(false);

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

  const updateWalkMovement = useCallback((dt: number) => {
    if (!isWalkModeRef.current) return;
    if (document.pointerLockElement !== canvasRef.current) return;

    const renderer = rendererRef.current;
    const camera = renderer?.getCamera?.();
    if (!camera) return;

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

      if (typeof renderer.checkWalkCollision === 'function') {
        const allowedDiagonal = renderer.checkWalkCollision(
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
            const allowedX = renderer.checkWalkCollision(getCollisionOrigin(), dirX, 0, Math.abs(stepX), COLLISION_RADIUS);
            state.position.x += allowedX * dirX;
          }
          if (stepZ !== 0) {
            const dirZ = stepZ > 0 ? 1 : -1;
            const allowedZ = renderer.checkWalkCollision(getCollisionOrigin(), 0, dirZ, Math.abs(stepZ), COLLISION_RADIUS);
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

      if (typeof renderer.findFloorHeight === 'function') {
        const currentFloorY = state.position.y - EYE_HEIGHT;
        const floorY = renderer.findFloorHeight(state.position.x, state.position.z, currentFloorY);
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
  }, [rendererRef, canvasRef]);

  const enterWalkMode = useCallback(async () => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;

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
      floorY = renderer.findFloorHeight?.(startX, startZ, camY) ?? null;
      if (floorY === null) {
        floorY = renderer.findFloorHeight?.(startX, startZ) ?? null;
      }
    }

    if (floorY === null) {
      const bounds = renderer.getModelBounds?.();
      if (bounds) {
        const clampedX = Math.max(bounds.min.x, Math.min(bounds.max.x, startX));
        const clampedZ = Math.max(bounds.min.z, Math.min(bounds.max.z, startZ));
        const retryFloor = renderer.findFloorHeight?.(clampedX, clampedZ) ?? null;
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
  }, [rendererRef, canvasRef]);

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