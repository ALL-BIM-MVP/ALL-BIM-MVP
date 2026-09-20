import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, ZoomIn, ZoomOut } from 'lucide-react';

// Tamaño del cuadro de recorte EN PANTALLA — el recorte real que se
// sube es cuadrado, OUTPUT_SIZE de lado (mismo tamaño que el backend
// usa para la foto de perfil, AVATAR_SIZE en avatar.ts). El backend
// sigue recortando lo que reciba a un cuadrado — pero si ya se manda
// una imagen cuadrada del tamaño exacto, ese recorte no le saca nada
// más, la elección real ya la hizo el usuario acá.
const VIEWPORT = 224;
const OUTPUT_SIZE = 256;

interface AvatarCropperProps {
  file: File;
  uploading: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

const AvatarCropper: React.FC<AvatarCropperProps> = ({ file, uploading, error, onCancel, onConfirm }) => {
  const [src] = useState(() => URL.createObjectURL(file));
  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [ready, setReady] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; origin: { x: number; y: number } } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // No deja alejar tanto como para que queden franjas vacías en el
  // cuadro — el lado más chico de la imagen siempre cubre el viewport
  // entero, sea cual sea el zoom/posición.
  const clamp = useCallback((next: { x: number; y: number }, z: number) => {
    if (!imgSize.w) return next;
    const baseScale = VIEWPORT / Math.min(imgSize.w, imgSize.h);
    const scale = baseScale * z;
    const halfW = (imgSize.w * scale) / 2;
    const halfH = (imgSize.h * scale) / 2;
    const maxX = Math.max(0, halfW - VIEWPORT / 2);
    const maxY = Math.max(0, halfH - VIEWPORT / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, next.x)),
      y: Math.min(maxY, Math.max(-maxY, next.y)),
    };
  }, [imgSize]);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setImgSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
    setReady(true);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: pos };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos(clamp({ x: dragRef.current.origin.x + dx, y: dragRef.current.origin.y + dy }, zoom));
  };
  const onPointerUp = () => { dragRef.current = null; };

  const onZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const z = parseFloat(e.target.value);
    setZoom(z);
    setPos((p) => clamp(p, z));
  };

  // Rueda del mouse también hace zoom — cómodo, no reemplaza el
  // control deslizante (que además sirve en pantallas táctiles).
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const z = Math.min(3, Math.max(1, zoom - e.deltaY * 0.001));
    setZoom(z);
    setPos((p) => clamp(p, z));
  };

  const baseScale = imgSize.w ? VIEWPORT / Math.min(imgSize.w, imgSize.h) : 1;
  const scale = baseScale * zoom;

  const handleConfirm = () => {
    const img = imgRef.current;
    if (!img) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Mismo cálculo que el transform de pantalla (arriba), pasado de
    // la escala VIEWPORT a OUTPUT_SIZE — el archivo final tiene que
    // coincidir exacto con lo que se ve en el cuadro de recorte.
    const k = OUTPUT_SIZE / VIEWPORT;
    const drawW = imgSize.w * scale * k;
    const drawH = imgSize.h * scale * k;
    const drawX = OUTPUT_SIZE / 2 + pos.x * k - drawW / 2;
    const drawY = OUTPUT_SIZE / 2 + pos.y * k - drawH / 2;
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    canvas.toBlob((blob) => {
      if (!blob) return;
      onConfirm(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[210] p-6"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-xs w-full overflow-hidden">
        <div className="p-5 flex flex-col items-center">
          <div
            className="relative rounded-lg overflow-hidden mb-1 select-none"
            style={{
              width: VIEWPORT, height: VIEWPORT, background: '#111827',
              touchAction: 'none', cursor: 'grab',
              visibility: ready ? 'visible' : 'hidden',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onWheel={onWheel}
          >
            <img
              ref={imgRef}
              src={src}
              onLoad={onImgLoad}
              draggable={false}
              alt="Vista previa"
              style={{
                position: 'absolute',
                left: '50%', top: '50%',
                width: imgSize.w, height: imgSize.h,
                transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
                transformOrigin: 'center center',
                maxWidth: 'none',
              }}
            />
            {/* Sombreado de las esquinas — SÍ se guardan (son parte del
                cuadrado que se sube), pero nunca se ven en ningún lado
                de la app: el avatar siempre se muestra en círculo
                (rounded-full sobre la foto cuadrada), así que solo el
                círculo inscripto acá es lo que de verdad va a
                aparecer. Truco de box-shadow: el círculo mismo queda
                transparente, y su sombra (un aro enorme) tapa todo lo
                que está afuera, recortado por el overflow-hidden del
                padre. */}
            <div
              className="pointer-events-none"
              style={{
                position: 'absolute', left: 0, top: 0,
                width: VIEWPORT, height: VIEWPORT,
                borderRadius: '50%',
                boxShadow: '0 0 0 9999px rgba(17, 24, 39, 0.55)',
              }}
            />
          </div>
          {!ready && (
            <div style={{ width: VIEWPORT, height: VIEWPORT }} className="rounded-lg bg-gray-100 flex items-center justify-center text-xs text-gray-400 mb-1">
              Cargando...
            </div>
          )}

          <div className="w-full flex items-center gap-2 mt-3 px-1">
            <ZoomOut size={14} className="text-gray-400 flex-shrink-0" />
            <input
              type="range" min="1" max="3" step="0.01" value={zoom}
              onChange={onZoomChange}
              className="flex-1 accent-[#0056b3]"
            />
            <ZoomIn size={16} className="text-gray-400 flex-shrink-0" />
          </div>

          <p className="text-xs text-gray-500 text-center mt-3">
            Arrastrá la imagen y usá el zoom para elegir qué parte se conserva —
            lo sombreado se guarda, pero no se muestra en tu foto de perfil.
          </p>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>
        <div className="px-5 py-3.5 border-t border-gray-100 bg-gray-50/70 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={uploading}
            className="px-3.5 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={uploading || !ready}
            className="flex items-center gap-2 px-4 py-1.5 bg-[#0056b3] text-white rounded-lg text-sm font-semibold hover:bg-[#004494] disabled:opacity-50 transition-colors"
          >
            {uploading && <Loader2 size={14} className="animate-spin" />}
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AvatarCropper;
