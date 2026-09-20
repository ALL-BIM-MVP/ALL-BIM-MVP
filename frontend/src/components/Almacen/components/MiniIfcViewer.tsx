import React, { useEffect, useRef, useState } from 'react';
import { useModelLoader } from '../../IFCViewer/hooks/useModelLoader';
import { convertIfcToFragmentsClientSide } from '../../IFCViewer/workers/fragmentsImportWorkerClient';
import type { ModelBounds } from '../../IFCViewer/types';

interface MiniIfcViewerProps {
  file: File | null;
}

const MiniIfcViewer: React.FC<MiniIfcViewerProps> = ({ file }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<any>(null);
  const storeRef = useRef<any>({});
  const modelBoundsRef = useRef<ModelBounds | null>(null);

  const [fragmentsBuffer, setFragmentsBuffer] = useState<ArrayBuffer | null>(null);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (!file) {
       setFragmentsBuffer(null); 
      return;
     }
    let cancelled = false;
    setConverting(true);
    file.arrayBuffer()
      .then((buffer) => convertIfcToFragmentsClientSide(buffer))
      .then((frag) => { if (!cancelled) setFragmentsBuffer(frag);
        
       })
      .catch((err) => console.warn('[MiniIfcViewer] error convirtiendo IFC:', err))
      .finally(() => { if (!cancelled) setConverting(false); });
    return () => { cancelled = true; };
  }, [file]);

  const { loading, ready, debugInfo } = useModelLoader(
    null,
    { canvasRef, containerRef, rendererRef, storeRef, modelBoundsRef },
    {},
    fragmentsBuffer
  );

  // fitToView corre antes de que el ResizeObserver de useModelLoader mida
  // el tamaño real de este contenedor chico (usa el aspect por defecto
  // del canvas todavía) — se reencuadra apenas el tamaño real se conoce,
  // sin adivinar cuántos frames tarda ese resize en aplicarse.
  useEffect(() => {
    if (!ready || !containerRef.current) return;
    const observer = new ResizeObserver(() => {
      rendererRef.current?.fitToView?.(0.55);
      rendererRef.current?.getCamera?.()?.pan(20, 0);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div className="w-full h-full min-h-40 bg-gray-50 rounded-lg p-4">
      <div ref={containerRef} className="relative w-full h-full overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full" />
        {!file && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-300">
            Sin modelo cargado
          </div>
        )}
        {file && (converting || (loading && !ready)) && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 bg-gray-50">
            {converting ? 'Convirtiendo...' : debugInfo || 'Cargando...'}
          </div>
        )}
      </div>
    </div>
  );
};

export default MiniIfcViewer;
