// Detecta si la cámara (posición/orientación) o el tamaño del canvas
// cambiaron desde la última vez que se llamó — lo usan los hooks que
// reproyectan puntos 3D a pantalla en cada frame (useCrossTool,
// useMeasureTool, useElementCutTool): antes recalculaban y llamaban
// setState SIEMPRE, así la cámara estuviera totalmente quieta, forzando
// un re-render de React hasta 60 veces por segundo por nada. Ahora solo
// se recalcula cuando algo realmente cambió.
//
// Se compara posición + orientación de la cámara (cubre orbit/pan/zoom
// y cualquier animación de vuelo, todas terminan tocando estos dos) MÁS
// el tamaño del canvas — sin esto último, redimensionar el panel lateral
// sin mover la cámara dejaría las marcas (cruces/medidas) desalineadas,
// porque la proyección a pantalla depende también del tamaño del canvas.
export interface CameraSnapshot {
  px: number; py: number; pz: number;
  qx: number; qy: number; qz: number; qw: number;
  w: number; h: number;
}

export function cameraOrCanvasChanged(
  renderer: any,
  canvas: HTMLCanvasElement | null,
  lastRef: React.MutableRefObject<CameraSnapshot | null>
): boolean {
  const cameraController = renderer?.getCamera?.();
  const camera = cameraController?.camera;
  if (!camera || !canvas) return true; // sin datos suficientes -> más vale recalcular

  const p = camera.position;
  const q = camera.quaternion;
  const next: CameraSnapshot = {
    px: p.x, py: p.y, pz: p.z,
    qx: q.x, qy: q.y, qz: q.z, qw: q.w,
    w: canvas.width, h: canvas.height,
  };

  const last = lastRef.current;
  const changed =
    !last ||
    last.px !== next.px || last.py !== next.py || last.pz !== next.pz ||
    last.qx !== next.qx || last.qy !== next.qy || last.qz !== next.qz || last.qw !== next.qw ||
    last.w !== next.w || last.h !== next.h;

  lastRef.current = next;
  return changed;
}
