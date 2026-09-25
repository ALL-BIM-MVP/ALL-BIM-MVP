import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SimpleOrbitCamera } from '../utils/CityScene';
import { loadObjectModelFromArrayBuffer } from '../utils/objectModels';
import { productService } from '../../../services/almacen/product.service';

interface InlineModelPreviewProps {
  projectId: number;
  assetId: number;
  className?: string;
}

/** Recuadro fijo (sin modal) con el modelo 3D de un producto — se arrastra para orbitar. El
 * tamaño lo decide quien lo usa (className); pensado para un panel lateral, no un visor principal. */
const InlineModelPreview: React.FC<InlineModelPreviewProps> = ({ projectId, assetId, className = 'w-20 h-20' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;
    let disposed = false;
    const canvas = canvasRef.current;
    const container = containerRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#e7ebf0');
    const orbitCam = new SimpleOrbitCamera(container.clientWidth / Math.max(1, container.clientHeight), 0.5, 15);
    orbitCam.target.set(0, 0.6, 0);
    orbitCam.setRadius(1.9);

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

    productService.getModel3DAssetContentArrayBuffer(projectId, assetId)
      .then((buffer) => loadObjectModelFromArrayBuffer(buffer))
      .then((model) => {
        if (disposed) return;
        model.scale.setScalar(2.2);
        scene.add(model);
        setLoading(false);
      })
      .catch(() => {
        if (disposed) return;
        setError(true);
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
  }, [projectId, assetId]);

  return (
    <div ref={containerRef} className={`relative flex-shrink-0 bg-gray-50 border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full block cursor-grab active:cursor-grabbing" />
      {loading && !error && <p className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400 pointer-events-none">Cargando...</p>}
      {error && <p className="absolute inset-0 flex items-center justify-center text-[10px] text-red-400 text-center px-1 pointer-events-none">Sin vista previa</p>}
    </div>
  );
};

export default InlineModelPreview;
