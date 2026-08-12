// Controles de cámara (orbit/pan/zoom), selección por click (picking) y modo caminar
// (mirar con Pointer Lock). Consulta primero a la herramienta de medición, luego al
// láser: si alguna consume el evento (colocar/arrastrar un punto), la cámara NO
// orbita/hace pan.
import { useEffect } from 'react';

interface UseCameraControlsParams {
  ready: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  rendererRef: React.RefObject<any>;
  isWalkModeRef: React.RefObject<boolean>;
  walkStateRef: React.RefObject<{ yaw: number; pitch: number; position: any }>;
  measureModeRef: React.RefObject<boolean>;
  laserModeRef?: React.RefObject<boolean>;
  onPick: (expressId: number | null, point?: { x: number; y: number; z: number }) => void;
  onZoom?: () => void;
  onZoomEnd?: () => void;
  onMeasureMouseDown: (clientX: number, clientY: number) => boolean;
  onMeasureMouseMove: (clientX: number, clientY: number) => boolean;
  onMeasureMouseUp: () => boolean;
  onMeasureHover: (clientX: number, clientY: number) => void;
  onLaserMouseDown?: (clientX: number, clientY: number) => boolean;
  onLaserMouseMove?: (clientX: number, clientY: number) => boolean;
  onLaserMouseUp?: () => boolean;
  onLaserHover?: (clientX: number, clientY: number) => void;
}

export function useCameraControls(params: UseCameraControlsParams) {
  const {
    ready,
    canvasRef,
    rendererRef,
    isWalkModeRef,
    walkStateRef,
    measureModeRef,
    laserModeRef,
    onPick,
    onZoom,
    onZoomEnd,
    onMeasureMouseDown,
    onMeasureMouseMove,
    onMeasureMouseUp,
    onMeasureHover,
    onLaserMouseDown,
    onLaserMouseMove,
    onLaserMouseUp,
    onLaserHover,
  } = params;

  useEffect(() => {
    if (!ready) return;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;
    const camera = renderer.getCamera?.();
    if (!camera) {
      console.warn('renderer.getCamera() no disponible: sin controles de mouse.');
      return;
    }

    let isDragging = false;
    let isPanning = false;
    let lastX = 0, lastY = 0, downX = 0, downY = 0;
    let wheelEndTimeout: number | null = null;

    const handleMouseDown = (e: MouseEvent) => {
      // Prioridad: medición > láser > orbit/pan. Si alguna herramienta coloca o
      // empieza a arrastrar un punto, no dejamos que además dispare la cámara.
      if (onMeasureMouseDown(e.clientX, e.clientY)) return;
      if (onLaserMouseDown?.(e.clientX, e.clientY)) return;

      isDragging = true;
      isPanning = e.button === 1 || e.button === 2 || e.shiftKey;
      lastX = e.clientX; lastY = e.clientY;
      downX = e.clientX; downY = e.clientY;
      canvas.style.cursor = isPanning ? 'move' : 'grabbing';

      onZoom?.(); // esconde el popup al empezar a arrastrar (orbit/pan), igual que con zoom
    };

    const handleMouseMove = (e: MouseEvent) => {
      onMeasureHover(e.clientX, e.clientY);
      onLaserHover?.(e.clientX, e.clientY);

      // Si hay un punto en arrastre (medición o láser), se re-raycastea y listo: no orbitar.
      const consumedByMeasure = onMeasureMouseMove(e.clientX, e.clientY);
      const consumedByLaser = !consumedByMeasure && (onLaserMouseMove?.(e.clientX, e.clientY) ?? false);

      if (consumedByMeasure || consumedByLaser) return;

      if (isWalkModeRef.current && document.pointerLockElement === canvas) {
        const sensitivity = 0.0022;
        walkStateRef.current.yaw -= e.movementX * sensitivity;
        walkStateRef.current.pitch = Math.max(
          -1.4,
          Math.min(1.4, walkStateRef.current.pitch - e.movementY * sensitivity)
        );
        return;
      }

      if (!isDragging) return;
      const deltaX = e.clientX - lastX;
      const deltaY = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;

      if (isPanning) camera.pan(deltaX, deltaY);
      else camera.orbit(deltaX, deltaY);
      renderer.render();
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (onMeasureMouseUp()) return; // se soltó un punto de medición en arrastre
      if (onLaserMouseUp?.()) return; // se soltó un punto/codo del láser en arrastre

      const wasDragging = isDragging;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      isDragging = false;
      isPanning = false;
      canvas.style.cursor = 'grab';

      if (isWalkModeRef.current) return;

      if (wasDragging && moved < 4 && renderer.pick) {
        // Fue un click real (casi sin movimiento), no un arrastre de cámara.
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        try {
          const hit = await renderer.pick(x, y);
          onPick(hit ? hit.expressId : null, hit?.point);
        } catch (err) {
          console.warn('Error en pick:', err);
        }
      } else if (wasDragging && moved >= 4) {
        // Fue un arrastre real de cámara (orbit/pan) — restaura el popup del
        // elemento que ya estaba seleccionado, si había uno.
        onZoomEnd?.();
      }
    };

    const handleMouseLeave = () => {
      isDragging = false;
      isPanning = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      camera.zoom(e.deltaY, false, mouseX, mouseY, canvas.width, canvas.height);
      renderer.render();

      onZoom?.(); // oculta el popup mientras se está scrolleando
      if (wheelEndTimeout !== null) clearTimeout(wheelEndTimeout);
      wheelEndTimeout = window.setTimeout(() => {
        onZoomEnd?.(); // reaparece cuando dejaste de scrollear (400ms sin nuevo scroll)
      }, 400);
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    const handleClick = () => {
      if (isWalkModeRef.current && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', handleContextMenu);
    canvas.addEventListener('click', handleClick);
    canvas.style.cursor = 'grab';

    return () => {
      if (wheelEndTimeout !== null) clearTimeout(wheelEndTimeout);
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      canvas.removeEventListener('click', handleClick);
    };
  }, [
    ready,
    canvasRef,
    rendererRef,
    isWalkModeRef,
    walkStateRef,
    measureModeRef,
    laserModeRef,
    onPick,
    onZoom,
    onZoomEnd,
    onMeasureMouseDown,
    onMeasureMouseMove,
    onMeasureMouseUp,
    onMeasureHover,
    onLaserMouseDown,
    onLaserMouseMove,
    onLaserMouseUp,
    onLaserHover,
  ]);
}