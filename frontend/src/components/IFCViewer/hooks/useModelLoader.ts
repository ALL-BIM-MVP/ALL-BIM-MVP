import { useEffect, useState, useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { TypeGroup, ModelBounds, ViewPreset } from '../types';
import { ThreeSceneController } from '../utils/ThreeSceneController';
import { IfcWorkerClient } from '../workers/ifcWorkerClient';

export interface ParamIndexEntry {
  expressId: number;
  elementName: string;
  typeName: string;
  category: string;
  paramName: string;
  paramValue: string;
}

export interface PendingScreenshot {
  blob: Blob;
  previewUrl: string;
}

interface ModelLoaderRefs {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  rendererRef: React.MutableRefObject<any>;
  storeRef: React.MutableRefObject<any>;
  modelBoundsRef: React.MutableRefObject<ModelBounds | null>;
}

interface UseModelLoaderOptions {
  onFrame?: (dt: number) => void;
  getClearColor?: () => [number, number, number, number];
  getSectionPlane?: () => any;
}

export function useModelLoader(
  fileBuffer: ArrayBuffer | null,
  refs: ModelLoaderRefs,
  options: UseModelLoaderOptions = {}
) {
  const { canvasRef, containerRef, rendererRef, storeRef, modelBoundsRef } = refs;
  const { onFrame, getClearColor, getSectionPlane } = options;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [debugInfo, setDebugInfo] = useState('Esperando archivo...');
  const [ready, setReady] = useState(false);
  const [typeGroups, setTypeGroups] = useState<TypeGroup[]>([]);
  const [paramIndex, setParamIndex] = useState<ParamIndexEntry[]>([]);
  const [pendingScreenshot, setPendingScreenshot] = useState<PendingScreenshot | null>(null);
  const pendingScreenshotRef = useRef<PendingScreenshot | null>(null);
  useEffect(() => { pendingScreenshotRef.current = pendingScreenshot; }, [pendingScreenshot]);

  const [edgesVisible, setEdgesVisible] = useState(false);
  const toggleEdges = useCallback(() => setEdgesVisible((prev) => !prev), []);
  useEffect(() => {
    rendererRef.current?.setEdgesVisible?.(edgesVisible);
  }, [edgesVisible, ready, rendererRef]);

  useEffect(() => {
    let isMounted = true;
    let rafId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let controller: ThreeSceneController | null = null;
    let client: IfcWorkerClient | null = null;

    const loadModel = async () => {
      if (!fileBuffer || !canvasRef.current || !containerRef.current) {
        setDebugInfo('Esperando archivo IFC...');
        return;
      }

      setLoading(true);
      setError(null);
      setProgress(0);
      setReady(false);
      setTypeGroups([]);
      setParamIndex([]);
      setDebugInfo('Iniciando carga...');

      try {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        let rect = container.getBoundingClientRect();
        let attempts = 0;
        while ((rect.width === 0 || rect.height === 0) && attempts < 30) {
          await new Promise((r) => requestAnimationFrame(r));
          rect = container.getBoundingClientRect();
          attempts++;
        }
        if (rect.width === 0 || rect.height === 0) {
          throw new Error('El contenedor del visor tiene tamaño 0.');
        }
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        setProgress(10);

        setDebugInfo('Inicializando web-ifc (worker)...');
        client = new IfcWorkerClient();
        storeRef.current = { client };
        setProgress(20);

        controller = new ThreeSceneController(canvas);
        rendererRef.current = controller;

        const bufferForWorker = fileBuffer.slice(0);

        await new Promise<void>((resolve, reject) => {
          if (!client) { reject(new Error('No se pudo inicializar el worker de IFC.')); return; }

          client.openModel(bufferForWorker, {
            onProgress: (percent, label) => {
              if (!isMounted) return;
              setProgress(percent);
              setDebugInfo(label);
            },

            onShellReady: ({ shellMeshes, typeGroups: groups, expressIdToTypeEntries }) => {
              if (!isMounted || !controller) return;

              const meshes = shellMeshes.map(materializeMesh);
              if (meshes.length === 0) {
                reject(new Error('No se generó geometría. ¿El IFC tiene geometría 3D?'));
                return;
              }
              setProgress(85);

              setTypeGroups(groups);

              const bounds = computeBoundsFromMeshes(meshes);
              modelBoundsRef.current = bounds;
              controller.setModelBounds(bounds);

              controller.loadGeometry(meshes);
              controller.fitToView();

              let lastTime = performance.now();
              const renderLoop = () => {
                if (!isMounted || !controller) return;
                const now = performance.now();
                const dt = Math.min((now - lastTime) / 1000, 0.1);
                lastTime = now;

                onFrame?.(dt);
                controller.getCamera().update(dt);

                controller.render({
                  clearColor: getClearColor?.() ?? [0.9333, 0.9333, 0.9333, 1],
                  sectionPlane: getSectionPlane?.(),
                });
                rafId = requestAnimationFrame(renderLoop);
              };
              renderLoop();

              const resizeCanvasToContainer = () => {
                const dpr = Math.min(window.devicePixelRatio || 1, 2);
                const newRect = container.getBoundingClientRect();
                const w = Math.max(1, Math.round(newRect.width * dpr));
                const h = Math.max(1, Math.round(newRect.height * dpr));
                if (canvas.width === w && canvas.height === h) return;
                controller?.resize(w, h);
              };
              requestAnimationFrame(() => requestAnimationFrame(resizeCanvasToContainer));
              resizeObserver = new ResizeObserver(resizeCanvasToContainer);
              resizeObserver.observe(container);

              setDebugInfo('');
              setLoading(false);
              setProgress(100);
              setReady(true);

              const clientRef = client;
              setTimeout(async () => {
                try {
                  const index = await clientRef?.indexAllParams();
                  if (isMounted && index) setParamIndex(index);
                } catch { /* indexado opcional */ }
              }, 1000);

              resolve();
              void expressIdToTypeEntries;
            },

            onDetailMesh: (payload) => {
              if (!isMounted || !controller) return;
              controller.loadGeometry([materializeMesh(payload)]);
            },

            onDetailDone: () => {
              // Detalle terminado
            },
          });
        });
      } catch (err) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : 'Error desconocido';
        console.error('Error:', err);
        setError(`Error al procesar el IFC: ${msg}`);
        setDebugInfo(msg);
        setLoading(false);
      }
    };

    loadModel();

    return () => {
      isMounted = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      controller?.dispose();
      client?.dispose();
      rendererRef.current = null;
      storeRef.current = null;
      if (pendingScreenshotRef.current) {
        URL.revokeObjectURL(pendingScreenshotRef.current.previewUrl);
      }
    };
  }, [fileBuffer]);

  const handleFitToView = useCallback(() => rendererRef.current?.fitToView?.(), [rendererRef]);

  const setPresetView = useCallback((preset: ViewPreset) => {
    const controller = rendererRef.current;
    const camera = controller?.getCamera?.();
    const bounds = controller?.getModelBounds?.() ?? modelBoundsRef.current;
    if (camera && bounds) camera.setPresetView(preset, bounds);
    else controller?.fitToView?.();
  }, [rendererRef, modelBoundsRef]);

  const takeScreenshot = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const previewUrl = URL.createObjectURL(blob);
      if (pendingScreenshotRef.current) {
        URL.revokeObjectURL(pendingScreenshotRef.current.previewUrl);
      }
      setPendingScreenshot({ blob, previewUrl });
    }, 'image/png');
  }, [canvasRef]);

  const discardScreenshot = useCallback(() => {
    if (pendingScreenshotRef.current) {
      URL.revokeObjectURL(pendingScreenshotRef.current.previewUrl);
    }
    setPendingScreenshot(null);
  }, []);

  const downloadScreenshot = useCallback(() => {
    const current = pendingScreenshotRef.current;
    if (!current) return;
    const reader = new FileReader();
    reader.onload = () => {
      const link = document.createElement('a');
      link.download = `modelo-ifc-${Date.now()}.png`;
      link.href = reader.result as string;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    reader.readAsDataURL(current.blob);
    URL.revokeObjectURL(current.previewUrl);
    setPendingScreenshot(null);
  }, []);

  return {
    loading, error, progress, debugInfo, ready, typeGroups, paramIndex,
    handleFitToView, setPresetView,
    takeScreenshot, pendingScreenshot, discardScreenshot, downloadScreenshot,
    edgesVisible, toggleEdges,
  };
}

function materializeMesh(payload: MeshPayload): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(payload.position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(payload.normal, 3));
  geometry.setIndex(new THREE.BufferAttribute(payload.index, 1));
  geometry.setAttribute('expressId', new THREE.BufferAttribute(payload.expressId, 1));
  geometry.setAttribute('hidden', new THREE.BufferAttribute(new Float32Array(payload.expressId.length), 1));
  geometry.setAttribute('selected', new THREE.BufferAttribute(new Float32Array(payload.expressId.length), 1));

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(payload.color.r, payload.color.g, payload.color.b),
    transparent: payload.opacity < 1,
    opacity: payload.opacity,
    side: THREE.DoubleSide,
    roughness: 0.6,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: 0.5,
    polygonOffsetUnits: 0.5,
  });
  applyPerElementShader(material);

  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.expressIdRanges = payload.ranges;

  const edgesGeometry = new THREE.BufferGeometry();
  edgesGeometry.setAttribute('position', new THREE.BufferAttribute(payload.edgePosition, 3));
  edgesGeometry.setAttribute('expressId', new THREE.BufferAttribute(payload.edgeExpressId, 1));
  edgesGeometry.setAttribute('hidden', new THREE.BufferAttribute(new Float32Array(payload.edgeExpressId.length), 1));

  const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x5a5a5a, transparent: true, opacity: 0.3 });
  applyEdgeHiddenShader(edgesMaterial);
  const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
  edges.userData.candidateIdsPerVertex = payload.edgeCandidateIds;
  edges.visible = false;
  edges.raycast = () => {};
  mesh.add(edges);

  return mesh;
}

function computeBoundsFromMeshes(meshes: THREE.Mesh[]): ModelBounds | null {
  const box = new THREE.Box3();
  let found = false;
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    if (mesh.geometry.boundingBox) {
      box.union(mesh.geometry.boundingBox);
      found = true;
    }
  }
  if (!found) return null;
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
  };
}

function boostSaturation(color: THREE.Color, factor: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const boosted = new THREE.Color();
  boosted.setHSL(hsl.h, Math.min(1, hsl.s * factor), hsl.l);
  return boosted;
}
void boostSaturation;

function applyPerElementShader(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `attribute float hidden;\nattribute float selected;\nvarying float vHidden;\nvarying float vSelected;\n#include <common>`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvHidden = hidden;\nvSelected = selected;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `varying float vHidden;\nvarying float vSelected;\n#include <common>`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\nif (vHidden > 0.5) { discard; }\nif (vSelected > 0.5) { diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.0, 0.898, 1.0), 0.6); }`
      );
  };
  material.customProgramCacheKey = () => 'per-element-vis-sel';
}

function applyEdgeHiddenShader(material: THREE.LineBasicMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `attribute float hidden;\nvarying float vHidden;\n#include <common>`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvHidden = hidden;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `varying float vHidden;\n#include <common>`)
      .replace('#include <color_fragment>', `#include <color_fragment>\nif (vHidden > 0.5) { discard; }`);
  };
  material.customProgramCacheKey = () => 'edge-hidden';
}

interface MeshPayload {
  color: { r: number; g: number; b: number };
  opacity: number;
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  expressId: Float32Array;
  ranges: { expressId: number; start: number; end: number }[];
  edgePosition: Float32Array;
  edgeExpressId: Float32Array;
  edgeCandidateIds: number[][];
}