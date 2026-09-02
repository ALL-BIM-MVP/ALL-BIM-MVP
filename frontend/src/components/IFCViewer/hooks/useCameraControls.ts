import { useEffect } from 'react';
import * as THREE from 'three';

interface UseCameraControlsParams {
  ready: boolean;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  rendererRef: React.RefObject<any>;
  storeRef?: React.RefObject<any>;
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
  onPaintMouseDown?: (clientX: number, clientY: number) => boolean;
  onPaintMouseMove?: (clientX: number, clientY: number) => boolean;
  onPaintMouseUp?: () => boolean;
  onCutMouseDown?: (clientX: number, clientY: number) => boolean;
  onCutMouseMove?: (clientX: number, clientY: number) => boolean;
  onCutMouseUp?: () => boolean;
}

export function useCameraControls(params: UseCameraControlsParams) {
  const {
    ready,
    canvasRef,
    rendererRef,
    storeRef,
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
    onPaintMouseDown,
    onPaintMouseMove,
    onPaintMouseUp,
    onCutMouseDown,
    onCutMouseMove,
    onCutMouseUp,
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

    let proximityBusy = false;
    const proximityRef = { current: Infinity };
    const updateProximity = () => {
      const model = storeRef?.current?.fragmentsModel;
      if (model) {
        if (proximityBusy) return;
        proximityBusy = true;
        try {
          const rect = canvas.getBoundingClientRect();
          const mouse = new THREE.Vector2(rect.left + rect.width / 2, rect.top + rect.height / 2);
          Promise.resolve(model.raycastAll({ camera: camera.camera, mouse, dom: canvas }))
            .then((results: any[]) => {
              if (!results || results.length === 0) { proximityRef.current = Infinity; return; }
              let nearest = Infinity;
              for (const r of results) {
                const d = r.rayDistance ?? r.distance;
                if (typeof d === 'number' && Number.isFinite(d) && d < nearest) nearest = d;
              }
              proximityRef.current = nearest;
            })
            .catch(() => { proximityRef.current = Infinity; })
            .finally(() => { proximityBusy = false; });
        } catch {
          proximityRef.current = Infinity;
          proximityBusy = false;
        }
      } else if (typeof renderer.raycastForward === 'function') {
        try {
          proximityRef.current = renderer.raycastForward();
        } catch {
          proximityRef.current = Infinity;
        }
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (onMeasureMouseDown(e.clientX, e.clientY)) return;
      if (e.button === 0 && onCutMouseDown?.(e.clientX, e.clientY)) return;
      if (onLaserMouseDown?.(e.clientX, e.clientY)) return;
      if (e.button === 0 && onPaintMouseDown?.(e.clientX, e.clientY)) return;

      isDragging = true;
      isPanning = e.button === 1 || e.button === 2 || e.shiftKey;
      lastX = e.clientX; lastY = e.clientY;
      downX = e.clientX; downY = e.clientY;
      canvas.style.cursor = isPanning ? 'move' : 'grabbing';
      updateProximity();

      onZoom?.();
    };

    const handleMouseMove = (e: MouseEvent) => {
      onMeasureHover(e.clientX, e.clientY);
      onLaserHover?.(e.clientX, e.clientY);

      const consumedByMeasure = onMeasureMouseMove(e.clientX, e.clientY);
      const consumedByCut = !consumedByMeasure && (onCutMouseMove?.(e.clientX, e.clientY) ?? false);
      const consumedByLaser = !consumedByMeasure && !consumedByCut && (onLaserMouseMove?.(e.clientX, e.clientY) ?? false);
      const consumedByPaint = !consumedByMeasure && !consumedByCut && !consumedByLaser && (onPaintMouseMove?.(e.clientX, e.clientY) ?? false);

      if (consumedByMeasure || consumedByCut || consumedByLaser || consumedByPaint) return;

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
      else camera.orbit(deltaX, deltaY, proximityRef.current);
      updateProximity();
      // Sin renderer.render() acá a propósito — el loop continuo en
      // useModelLoader.ts (requestAnimationFrame) YA redibuja la escena
      // en cada frame sin condición, así que esto era puro trabajo
      // redundante: con archivos grandes, cada evento de mousemove
      // (varios por frame en mouses/trackpads de alto polling) disparaba
      // SU PROPIO render() completo además del que ya iba a pasar en el
      // próximo tick del loop — el costo se duplicaba (o más) mientras
      // durara el arrastre, viéndose como que "se pone cada vez más
      // lento" cuanto más se sigue interactuando.
    };

    const handleMouseUp = async (e: MouseEvent) => {
      if (onMeasureMouseUp()) return;
      if (onCutMouseUp?.()) return;
      if (onLaserMouseUp?.()) return;
      if (onPaintMouseUp?.()) return;

      const wasDragging = isDragging;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      isDragging = false;
      isPanning = false;
      canvas.style.cursor = 'grab';


      if (isWalkModeRef.current && document.pointerLockElement === canvas) return;

      if (wasDragging && moved < 4 && renderer.pick) {
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
      // rect.width/height (píxeles CSS), no canvas.width/height (resolución
      // interna, escalada por devicePixelRatio) — mouseX/mouseY ya están en
      // CSS px, mezclar los dos torcía el punto bajo el cursor.
      camera.zoom(e.deltaY, mouseX, mouseY, rect.width, rect.height, proximityRef.current);
      updateProximity();

      onZoom?.();
      if (wheelEndTimeout !== null) clearTimeout(wheelEndTimeout);
      wheelEndTimeout = window.setTimeout(() => {
        onZoomEnd?.();
      }, 400);
    };

    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('contextmenu', handleContextMenu);
    canvas.style.cursor = 'grab';

    return () => {
      if (wheelEndTimeout !== null) clearTimeout(wheelEndTimeout);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('contextmenu', handleContextMenu);
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
    onPaintMouseDown,
    onPaintMouseMove,
    onPaintMouseUp,
    onCutMouseDown,
    onCutMouseMove,
    onCutMouseUp,
  ]);
}
