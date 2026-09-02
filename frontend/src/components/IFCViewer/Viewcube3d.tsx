import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ViewPreset } from './hooks/useIfcModel';

interface ViewCube3DProps {
  onSelect: (preset: ViewPreset) => void;
  // Posición en pantalla donde debe aparecer el cubo (ya que al usar portal,
  // ya no se posiciona relativo al visor con "absolute top-3 right-3").
  anchorRef?: React.RefObject<HTMLElement | null>;
  rightOffset?: number;
  
  visible?: boolean;
}

const SIZE = 44;
const HALF = SIZE / 2;

interface FaceDef {
  preset: ViewPreset;
  label: string;
  transform: string;
}

const FACES: FaceDef[] = [
  { preset: 'front', label: 'FRENTE', transform: `rotateY(0deg) translateZ(${HALF}px)` },
  { preset: 'back', label: 'ATRÁS', transform: `rotateY(180deg) translateZ(${HALF}px)` },
  { preset: 'right', label: 'DER', transform: `rotateY(90deg) translateZ(${HALF}px)` },
  { preset: 'left', label: 'IZQ', transform: `rotateY(-90deg) translateZ(${HALF}px)` },
  { preset: 'top', label: 'ARRIBA', transform: `rotateX(90deg) translateZ(${HALF}px)` },
  { preset: 'bottom', label: 'ABAJO', transform: `rotateX(-90deg) translateZ(${HALF}px)` },
];

type FaceDir = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
const FACE_ROTATE: Record<FaceDir, (half: number) => string> = {
  front: (h) => `rotateY(0deg) translateZ(${h}px)`,
  back: (h) => `rotateY(180deg) translateZ(${h}px)`,
  right: (h) => `rotateY(90deg) translateZ(${h}px)`,
  left: (h) => `rotateY(-90deg) translateZ(${h}px)`,
  top: (h) => `rotateX(90deg) translateZ(${h}px)`,
  bottom: (h) => `rotateX(-90deg) translateZ(${h}px)`,
};

const CORNER_SIZE = 10;
const CORNER_HALF = CORNER_SIZE / 2;

interface CornerDef { preset: ViewPreset; faces: FaceDir[]; sx: 1 | -1; sy: 1 | -1; sz: 1 | -1; }
const CORNERS: CornerDef[] = [
  { preset: 'top-front-right', faces: ['top', 'front', 'right'], sx: 1, sy: -1, sz: 1 },
  { preset: 'top-front-left', faces: ['top', 'front', 'left'], sx: -1, sy: -1, sz: 1 },
  { preset: 'top-back-right', faces: ['top', 'back', 'right'], sx: 1, sy: -1, sz: -1 },
  { preset: 'top-back-left', faces: ['top', 'back', 'left'], sx: -1, sy: -1, sz: -1 },
  { preset: 'bottom-front-right', faces: ['bottom', 'front', 'right'], sx: 1, sy: 1, sz: 1 },
  { preset: 'bottom-front-left', faces: ['bottom', 'front', 'left'], sx: -1, sy: 1, sz: 1 },
  { preset: 'bottom-back-right', faces: ['bottom', 'back', 'right'], sx: 1, sy: 1, sz: -1 },
  { preset: 'bottom-back-left', faces: ['bottom', 'back', 'left'], sx: -1, sy: 1, sz: -1 },
];

const DEFAULT_ROTATION = { x: -22, y: -38 };

const VIEW_TARGETS: Record<ViewPreset, { x: number; y: number }> = {
  front: { x: -22, y: 0 },
  back: { x: -22, y: 180 },
  right: { x: -22, y: 90 },
  left: { x: -22, y: -90 },
  top: { x: -85, y: -38 },
  bottom: { x: 85, y: -38 },
  'top-front-right': { x: -35, y: 45 },
  'top-front-left': { x: -35, y: -45 },
  'top-back-right': { x: -35, y: 135 },
  'top-back-left': { x: -35, y: -135 },
  'bottom-front-right': { x: 35, y: 45 },
  'bottom-front-left': { x: 35, y: -45 },
  'bottom-back-right': { x: 35, y: 135 },
  'bottom-back-left': { x: 35, y: -135 },
};

// Margen desde el borde derecho del visor hasta el cubo. Subir este
// número mueve el cubo hacia la IZQUIERDA (más lejos del borde);
// bajarlo lo mueve hacia la DERECHA (más cerca del borde).
const RIGHT_MARGIN = 8;

// Margen desde el borde SUPERIOR del visor hasta el cubo. Bajar este
// número mueve el cubo hacia ARRIBA (más cerca del borde); subirlo lo
// mueve hacia ABAJO (más lejos del borde).
const TOP_MARGIN = -4;

const ViewCube3D: React.FC<ViewCube3DProps> = ({ onSelect, anchorRef, rightOffset = 0, visible = true }) => {
  const [rotation, setRotation] = useState(DEFAULT_ROTATION);
  const [hoveredFace, setHoveredFace] = useState<ViewPreset | null>(null);
  const [hoveredCorner, setHoveredCorner] = useState<ViewPreset | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [screenPos, setScreenPos] = useState<{ top: number; left: number } | null>(null);

  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });

  // Calcula la posición en pantalla del widget, siguiendo la esquina superior
  // derecha del contenedor ancla (o de la ventana, si no hay anchorRef).
  // rightOffset corre el cubo hacia la izquierda para no quedar tapado por
  // un panel superpuesto — se recalcula cada vez que cambia (panel se abre,
  // cierra, o se arrastra su ancho), así el cubo lo sigue en vivo.
  useEffect(() => {
    const updatePosition = () => {
      if (anchorRef?.current) {
        const rect = anchorRef.current.getBoundingClientRect();
        setScreenPos({ top: rect.top + TOP_MARGIN, left: rect.right - 110 - RIGHT_MARGIN - rightOffset });
      } else {
        setScreenPos({ top: TOP_MARGIN, left: window.innerWidth - 110 - RIGHT_MARGIN - rightOffset });
      }
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, rightOffset]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    movedRef.current = false;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
  }, []);

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastPosRef.current.x;
      const dy = e.clientY - lastPosRef.current.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true;
      lastPosRef.current = { x: e.clientX, y: e.clientY };

      setRotation(prev => ({
        x: Math.max(-85, Math.min(85, prev.x - dy * 1.2)),
        y: prev.y + dx * 1.2,
      }));
    };

    const handleWindowMouseUp = () => {
      draggingRef.current = false;
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, []);

  const handleFaceClick = useCallback(
    (preset: ViewPreset) => {
      if (movedRef.current) return;
      onSelect(preset);
      setRotation(VIEW_TARGETS[preset]);
    },
    [onSelect]
  );

  if (!screenPos) return null;

  const cubeContent = (
    <div
      className="fixed select-none"
      style={{
        top: screenPos.top,
        left: screenPos.left,
        width: 110,
        height: 110,
        perspective: '420px',
        zIndex: 9999, // por encima de todo, ya que vive en document.body
        pointerEvents: visible ? 'auto' : 'none',
        display: visible ? 'block' : 'none',
      }}
      title="Arrastrá para rotar la vista · Click en una cara para encuadrar"
    >
      <div
        onMouseDown={handleMouseDown}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div
          style={{
    width: SIZE,
    height: SIZE,
    position: 'relative',
    transformStyle: 'preserve-3d',
    transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
    transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
    // sin filter acá — se lo movemos a cada cara individual, más abajo
  }}
        >
          {FACES.map((face) => {
            const isHovered = hoveredFace === face.preset;
            return (
              <div
                key={face.preset}
                onMouseEnter={() => setHoveredFace(face.preset)}
                onMouseLeave={() => setHoveredFace(null)}
                onClick={() => handleFaceClick(face.preset)}
                style={{
                  position: 'absolute',
                  width: SIZE,
                  height: SIZE,
                  left: 0,
                  top: 0,
                  transform: face.transform,
                  background: isHovered
                    ? 'linear-gradient(135deg, #4f9cf9, #0056b3)'
                    : 'linear-gradient(135deg, #ffffff, #d8dee6)',
                  border: '1px solid rgba(0,0,0,0.25)',
                  boxShadow: '0 3px 6px rgba(0,0,0,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 8.5,
                  fontWeight: 700,
                  letterSpacing: '0.03em',
                  color: isHovered ? '#ffffff' : '#5b6472',
                  cursor: 'pointer',
                  transition: 'background 0.15s ease, color 0.15s ease',
                  backfaceVisibility: 'hidden',
                }}
              >
                {face.label}
              </div>
            );
          })}
          {CORNERS.map((corner) => {
            const isHovered = hoveredCorner === corner.preset;
            const left = corner.sx > 0 ? SIZE - CORNER_SIZE : 0;
            const top = corner.sy > 0 ? SIZE - CORNER_SIZE : 0;
            const tz = corner.sz * (HALF - CORNER_HALF);
            return (
              <div
                key={corner.preset}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width: CORNER_SIZE,
                  height: CORNER_SIZE,
                  transformStyle: 'preserve-3d',
                  transform: `translateZ(${tz}px)`,
                }}
              >
                {corner.faces.map((dir) => (
                  <div
                    key={dir}
                    onMouseEnter={() => setHoveredCorner(corner.preset)}
                    onMouseLeave={() => setHoveredCorner(null)}
                    onClick={() => handleFaceClick(corner.preset)}
                    title="Vista de esquina"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: CORNER_SIZE,
                      height: CORNER_SIZE,
                      transform: FACE_ROTATE[dir](CORNER_HALF),
                      background: isHovered
                        ? 'linear-gradient(135deg, #4f9cf9, #0056b3)'
                        : 'linear-gradient(135deg, #ffffff, #d8dee6)',
                      border: '1px solid rgba(0,0,0,0.12)',
                      opacity: isHovered ? 1 : 0.75,
                      cursor: 'pointer',
                      transition: 'background 0.15s ease, opacity 0.15s ease',
                      backfaceVisibility: 'hidden',
                    }}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(cubeContent, document.body);
};

export default ViewCube3D;