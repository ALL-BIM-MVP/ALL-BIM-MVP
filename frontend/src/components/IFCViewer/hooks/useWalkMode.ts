// TODO: extraer de useIfcModel.ts - modo caminar WASD
import { useState, useRef, useEffect, useCallback } from 'react';

export function useWalkMode(
  rendererRef: React.RefObject<any>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) {
  const [isWalkMode, setIsWalkMode] = useState(false);
  const isWalkModeRef = useRef(false);
  const walkStateRef = useRef({ position: { x: 0, y: 1.7, z: 0 }, yaw: 0, pitch: 0 });
  const keysPressedRef = useRef<Set<string>>(new Set());

  useEffect(() => { isWalkModeRef.current = isWalkMode; }, [isWalkMode]);

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
    const renderer = rendererRef.current;
    const camera = renderer?.getCamera?.();
    if (!camera) return;

    const speed = 3;
    const keys = keysPressedRef.current;
    const state = walkStateRef.current;

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
      state.position.x += (moveX / len) * speed * dt;
      state.position.z += (moveZ / len) * speed * dt;
    }

    const lookDist = 5;
    const targetX = state.position.x + Math.sin(state.yaw) * Math.cos(state.pitch) * lookDist;
    const targetY = state.position.y + Math.sin(state.pitch) * lookDist;
    const targetZ = state.position.z - Math.cos(state.yaw) * Math.cos(state.pitch) * lookDist;

    camera.setPosition(state.position.x, state.position.y, state.position.z);
    camera.setTarget(targetX, targetY, targetZ);
  }, [rendererRef]);

  const enterWalkMode = useCallback(async () => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;

    try {
      const hit = await renderer.pick(canvas.width / 2, canvas.height / 2);
      if (hit?.point) {
        const { x, y, z } = hit.point;
        walkStateRef.current.position = { x, y: y + 1.7, z };
      }
    } catch {
      // sin intersección: arrancamos desde el origen
    }
    walkStateRef.current.yaw = 0;
    walkStateRef.current.pitch = 0;
    setIsWalkMode(true);
  }, [rendererRef, canvasRef]);

  const toggleWalkMode = useCallback(() => {
    setIsWalkMode(prev => {
      const next = !prev;
      if (next) enterWalkMode();
      return next;
    });
  }, [enterWalkMode]);

  return { isWalkMode, isWalkModeRef, walkStateRef, toggleWalkMode, updateWalkMovement };
}