import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import * as THREE from 'three';
import { SimpleOrbitCamera } from '../utils/CityScene';
import { loadObjectModelFromArrayBuffer } from '../utils/objectModels';
import { getFileContentArrayBuffer } from '../../../services/ifcfiles.service';

interface ModelPreviewModalProps {
  fileId: number;
  onClose: () => void;
}

/** Visor aislado y chico — solo para confirmar que un modelo 3D subido al catálogo abre bien, nada más. */
const ModelPreviewModal: React.FC<ModelPreviewModalProps> = ({ fileId, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    let disposed = false;
    const canvas = canvasRef.current;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e7ebf0');
    const orbitCam = new SimpleOrbitCamera(container.clientWidth / Math.max(1, container.clientHeight), 0.5, 15);
    orbitCam.target.set(0, 0.5, 0);
    orbitCam.setRadius(2.5);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight, false);

    scene.add(new THREE.AmbientLight('#ffffff', 0.8));
    const sun = new THREE.DirectionalLight('#fff6e6', 1);
    sun.position.set(3, 5, 4);
    scene.add(sun);

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      orbitCam.orbit(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onUp = () => {
      dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitCam.zoom(e.deltaY);
    };
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      orbitCam.update();
      renderer.render(scene, orbitCam.camera);
    };
    loop();

    getFileContentArrayBuffer(String(fileId))
      .then((buffer) => loadObjectModelFromArrayBuffer(buffer))
      .then((model) => {
        if (disposed) return;
        model.scale.setScalar(1.6);
        scene.add(model);
        setLoading(false);
      })
      .catch((err) => {
        if (disposed) return;
        setError(err instanceof Error ? err.message : 'No se pudo cargar el modelo 3D.');
        setLoading(false);
      });

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === 0 || h === 0) return;
      orbitCam.setAspect(w / h);
      renderer.setSize(w, h, false);
    });
    resizeObserver.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      renderer.dispose();
    };
  }, [fileId]);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg h-[28rem] bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">Modelo 3D</p>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-full p-1.5">
            <X size={16} />
          </button>
        </div>
        <div ref={containerRef} className="relative flex-1">
          <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />
          {loading && <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 pointer-events-none">Cargando modelo...</p>}
          {error && <p className="absolute inset-0 flex items-center justify-center text-sm text-red-500 px-6 text-center pointer-events-none">{error}</p>}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ModelPreviewModal;
