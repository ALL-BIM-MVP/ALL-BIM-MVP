// Primer paso de la migración a ThatOpen/Fragments (ver
// docs/roadmap/migracion-visor-thatopen.md) — SOLO carga y muestra un
// modelo vía @thatopen/fragments para validar que el camino completo
// funciona con un archivo real. A propósito, esto NO toca el visor
// real (IFCViewer.tsx/useIfcModel): ninguna herramienta (medir, cruz,
// selección, etc.) pasa por acá todavía. Si un archivo no tiene
// fragments_file_id, o algo falla, no hay "camino de siempre" al que
// caer — esta pantalla es aparte, de validación.
import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FragmentsModels } from '@thatopen/fragments';
import { getIfcProcessStatus, getFileContentArrayBuffer } from '../services/ifcfiles.service';

type LoadState =
  | { kind: 'loading'; label: string }
  | { kind: 'no-fragments' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

// Medición punto-a-punto de prueba — a propósito, sin snap a vértice/
// arista (eso sería una segunda capa). El objetivo es comparar
// model.raycast(...) de Fragments contra el bug real que encontramos en
// raycastSceneMagnetic (el rayo "resbala" a otro elemento en superficies
// de canto) — ver Fase 3 del roadmap de migración.
interface MeasureState {
  points: THREE.Vector3[]; // 0, 1 o 2
  distance: number | null;
}

export default function FragmentsPreview() {
  const { ifcFileId } = useParams<{ ifcFileId: string }>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<LoadState>({ kind: 'loading', label: 'Consultando el archivo…' });
  const [measure, setMeasure] = useState<MeasureState>({ points: [], distance: null });

  useEffect(() => {
    if (!ifcFileId || !canvasRef.current) return;
    let cancelled = false;
    let renderer: THREE.WebGLRenderer | null = null;
    let rafId: number | null = null;
    let fragments: FragmentsModels | null = null;
    let controls: OrbitControls | null = null;
    const cleanupFns: (() => void)[] = [];

    (async () => {
      try {
        setState({ kind: 'loading', label: 'Consultando el archivo…' });
        const status = await getIfcProcessStatus(ifcFileId);
        if (cancelled) return;
        if (!status.fragments_file_id) {
          setState({ kind: 'no-fragments' });
          return;
        }

        setState({ kind: 'loading', label: 'Descargando el .frag…' });
        const buffer = await getFileContentArrayBuffer(status.fragments_file_id);
        if (cancelled) return;

        setState({ kind: 'loading', label: 'Cargando el modelo…' });
        const canvas = canvasRef.current!;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xeeeeee);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.5));

        const camera = new THREE.PerspectiveCamera(50, canvas.clientWidth / canvas.clientHeight, 0.1, 10000);
        camera.position.set(10, 10, 10);

        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
        renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        const workerUrl = await FragmentsModels.getWorker();
        fragments = new FragmentsModels(workerUrl);

        const model = await fragments.load(buffer, { modelId: 'preview', camera });
        if (cancelled) { await fragments.dispose(); return; }

        model.useCamera(camera);
        scene.add(model.object);
        await fragments.update(true);

        const box = new THREE.Box3().setFromObject(model.object);
        if (!box.isEmpty()) {
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const radius = Math.max(size.length() * 0.6, 1);
          camera.position.set(center.x + radius, center.y + radius, center.z + radius);
          controls.target.copy(center);
          controls.update();
          await fragments.update(true);
        }

        const renderLoop = () => {
          if (cancelled) return;
          controls?.update();
          renderer?.render(scene, camera);
          rafId = requestAnimationFrame(renderLoop);
        };
        renderLoop();

        // --- Medición punto-a-punto de prueba ---
        const markerGeom = new THREE.SphereGeometry(0.06, 12, 12);
        const markerMat = new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false });
        const lineMat = new THREE.LineBasicMaterial({ color: 0xff3b30, depthTest: false });
        const measureGroup = new THREE.Group();
        measureGroup.renderOrder = 999;
        scene.add(measureGroup);

        const clickedPoints: THREE.Vector3[] = [];
        const rebuildMeasureVisuals = () => {
          measureGroup.clear();
          for (const p of clickedPoints) {
            const marker = new THREE.Mesh(markerGeom, markerMat);
            marker.position.copy(p);
            measureGroup.add(marker);
          }
          if (clickedPoints.length === 2) {
            const geom = new THREE.BufferGeometry().setFromPoints(clickedPoints);
            measureGroup.add(new THREE.Line(geom, lineMat));
          }
        };

        // OrbitControls arrastra con el mismo botón que clickeamos para
        // medir — el evento nativo "click" del navegador se dispara igual
        // al soltar, aunque hayas arrastrado la cámara. Por eso se mide la
        // distancia mousedown->mouseup, mismo criterio que ya usa
        // handleMouseUp en el visor real (moved < 4px = fue un click, no
        // un arrastre de cámara).
        let downX = 0, downY = 0;
        const onCanvasMouseDown = (e: MouseEvent) => { downX = e.clientX; downY = e.clientY; };
        canvas.addEventListener('mousedown', onCanvasMouseDown);
        cleanupFns.push(() => canvas.removeEventListener('mousedown', onCanvasMouseDown));

        const onCanvasClick = async (e: MouseEvent) => {
          if (!fragments || cancelled) return;
          if (Math.hypot(e.clientX - downX, e.clientY - downY) >= 4) return; // fue un arrastre de cámara, no un click
          // model.raycast(...) hace su PROPIO getBoundingClientRect() por
          // dentro (screenToCast, en el paquete) y resta rect.left/top —
          // espera coordenadas de página crudas, iguales a
          // MouseEvent.clientX/clientY. Restarlas acá también hacía que se
          // restaran DOS veces, corriendo el click hacia la derecha/abajo.
          const mouse = new THREE.Vector2(e.clientX, e.clientY);
          const result = await model.raycast({ camera, mouse, dom: canvas });
          if (!result) return;

          if (clickedPoints.length >= 2) clickedPoints.length = 0; // empieza una medición nueva
          clickedPoints.push(result.point.clone());
          rebuildMeasureVisuals();

          const distance = clickedPoints.length === 2
            ? clickedPoints[0].distanceTo(clickedPoints[1])
            : null;
          setMeasure({ points: [...clickedPoints], distance });
        };
        canvas.addEventListener('click', onCanvasClick);
        cleanupFns.push(() => canvas.removeEventListener('click', onCanvasClick));

        setState({ kind: 'ready' });
      } catch (err) {
        if (!cancelled) {
          console.error('[FragmentsPreview]', err);
          setState({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      cleanupFns.forEach((fn) => fn());
      controls?.dispose();
      renderer?.dispose();
      fragments?.dispose();
    };
  }, [ifcFileId]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#eee' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {state.kind !== 'ready' && (
        <div style={{ position: 'absolute', top: 16, left: 16, background: 'white', padding: '10px 14px', borderRadius: 8, fontFamily: 'sans-serif', fontSize: 13, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          {state.kind === 'loading' && state.label}
          {state.kind === 'no-fragments' && 'Este archivo todavía no tiene un .frag generado (fragments_file_id es null).'}
          {state.kind === 'error' && `Error: ${state.message}`}
        </div>
      )}
      {state.kind === 'ready' && (
        <div style={{ position: 'absolute', top: 16, left: 16, background: 'white', padding: '10px 14px', borderRadius: 8, fontFamily: 'sans-serif', fontSize: 13, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          {measure.points.length === 0 && 'Clickeá un punto del modelo para empezar a medir.'}
          {measure.points.length === 1 && 'Clickeá el segundo punto.'}
          {measure.points.length === 2 && measure.distance !== null &&
            `Distancia: ${measure.distance.toFixed(3)} m (clickeá de nuevo para medir otra cosa)`}
        </div>
      )}
    </div>
  );
}
