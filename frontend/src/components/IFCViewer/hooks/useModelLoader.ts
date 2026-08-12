// Carga IFC con web-ifc. Fusiona geometría por color (menos draw calls = más fps
// al orbitar), en vez de 1 malla por elemento IFC. Indexa parámetros de todos
// los elementos (con su categoría/Pset) en un segundo paso ASÍNCRONO, después
// de mostrar el modelo.
import { useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import * as WebIFC from 'web-ifc';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TypeGroup, ModelBounds, ViewPreset } from '../types';
import { ThreeSceneController } from '../utils/ThreeSceneController';

export interface ParamIndexEntry {
  expressId: number;
  elementName: string;
  typeName: string;
  category: string;
  paramName: string;
  paramValue: string;
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

  useEffect(() => {
    let isMounted = true;
    let rafId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let controller: ThreeSceneController | null = null;
    let api: WebIFC.IfcAPI | null = null;

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

        setDebugInfo('Inicializando web-ifc...');
        api = new WebIFC.IfcAPI();
        api.SetWasmPath('/wasm/', true);
        await api.Init();
        if (!isMounted) return;

        setDebugInfo('Parseando archivo IFC...');
        const modelID = api.OpenModel(new Uint8Array(fileBuffer), {
          COORDINATE_TO_ORIGIN: true,
          CIRCLE_SEGMENTS: 6,  // en gemetria poligiono
        });
        storeRef.current = { api, modelID };

        controller = new ThreeSceneController(canvas);
        rendererRef.current = controller;

        setDebugInfo('Generando geometría...');
        const { meshes, typeGroups: groups, expressIdToType } = buildMeshesFromModel(api, modelID);
        if (!isMounted) return;
        if (meshes.length === 0) throw new Error('No se generó geometría. ¿El IFC tiene geometría 3D?');

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

        indexAllParameters(api, modelID, expressIdToType, (idx) => {
          if (isMounted) setParamIndex(idx);
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
      rendererRef.current = null;
      storeRef.current = null;
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
    const link = document.createElement('a');
    link.download = `modelo-ifc-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [canvasRef]);

  return { loading, error, progress, debugInfo, ready, typeGroups, paramIndex, handleFitToView, setPresetView, takeScreenshot };
}

// --- helpers de geometría ---

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

function buildMeshesFromModel(api: WebIFC.IfcAPI, modelID: number) {
  const byType = new Map<string, number[]>();
  const colorGroups = new Map<string, { color: THREE.Color; opacity: number; geometries: THREE.BufferGeometry[] }>();
  const expressIdToType = new Map<number, string>();

  api.StreamAllMeshes(modelID, (flatMesh: any) => {
    const expressId = flatMesh.expressID;

    let typeName = 'UNKNOWN';
    try {
      const typeCode = api.GetLineType(modelID, expressId);
      typeName = (WebIFC as any).IfcElements?.[typeCode] ?? String(typeCode);
    } catch { /* si falla, se agrupa como UNKNOWN */ }
    if (!byType.has(typeName)) byType.set(typeName, []);
    byType.get(typeName)!.push(expressId);
    expressIdToType.set(expressId, typeName);

    const placedGeometries = flatMesh.geometries;
    for (let i = 0; i < placedGeometries.size(); i++) {
      try {
        const placed = placedGeometries.get(i);
        const ifcGeom = api.GetGeometry(modelID, placed.geometryExpressID);

        const vertexData = api.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
        const rawIndexData = api.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());
        const indexData = new Uint32Array(rawIndexData);

        if (!vertexData?.length || !indexData?.length) continue;

        const vertCount = vertexData.length / 6;
        const positions = new Float32Array(vertCount * 3);
        const normals = new Float32Array(vertCount * 3);
        for (let v = 0, p = 0; v < vertexData.length; v += 6, p += 3) {
          positions[p] = vertexData[v]; positions[p + 1] = vertexData[v + 1]; positions[p + 2] = vertexData[v + 2];
          normals[p] = vertexData[v + 3]; normals[p + 1] = vertexData[v + 4]; normals[p + 2] = vertexData[v + 5];
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
        geometry.setIndex(new THREE.BufferAttribute(indexData, 1));

        const matrix = new THREE.Matrix4().fromArray(placed.flatTransformation);
        geometry.applyMatrix4(matrix);

        geometry.setAttribute('expressId', new THREE.BufferAttribute(new Float32Array(vertCount).fill(expressId), 1));
        geometry.setAttribute('hidden', new THREE.BufferAttribute(new Float32Array(vertCount), 1));
        geometry.setAttribute('selected', new THREE.BufferAttribute(new Float32Array(vertCount), 1));
       

        const c = placed.color;
        const key = `${Math.round(c.x * 255)}_${Math.round(c.y * 255)}_${Math.round(c.z * 255)}_${Math.round(c.w * 100)}`;
        if (!colorGroups.has(key)) {
          colorGroups.set(key, { color: new THREE.Color(c.x, c.y, c.z), opacity: c.w, geometries: [] });
        }
        colorGroups.get(key)!.geometries.push(geometry);
      } catch (err) {
        console.warn(`Geometría inválida en expressId ${expressId}, se omite:`, err);
        continue;
      }
    }
  });

  const meshes: THREE.Mesh[] = [];
  colorGroups.forEach(({ color, opacity, geometries }) => {
    if (geometries.length === 0) return;

    let merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (!merged) return;

    merged = mergeVertices(merged, 1e-4);
    merged.computeVertexNormals();

    const expressIdAttr = merged.getAttribute('expressId') as THREE.BufferAttribute;
    const ranges: { expressId: number; start: number; end: number }[] = [];
    let rangeStart = 0;
    let currentId = expressIdAttr.getX(0);
    for (let i = 1; i <= expressIdAttr.count; i++) {
      const val = i < expressIdAttr.count ? expressIdAttr.getX(i) : NaN;
      if (val !== currentId) {
        ranges.push({ expressId: currentId, start: rangeStart, end: i });
        rangeStart = i;
        currentId = val;
      }
    }

    const material = new THREE.MeshStandardMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      side: THREE.DoubleSide,
      roughness: 0.85,
      metalness: 0.0,
      polygonOffset: true,
      polygonOffsetFactor: 0.5,
      polygonOffsetUnits: 0.5,
    });
    applyPerElementShader(material);

    const mesh = new THREE.Mesh(merged, material);
    mesh.userData.expressIdRanges = ranges;

    const posAttrMerged = merged.getAttribute('position') as THREE.BufferAttribute;
    const posToExpressId = new Map<string, number>();
    for (let i = 0; i < posAttrMerged.count; i++) {
      const key = `${posAttrMerged.getX(i).toFixed(4)}_${posAttrMerged.getY(i).toFixed(4)}_${posAttrMerged.getZ(i).toFixed(4)}`;
      posToExpressId.set(key, expressIdAttr.getX(i));
    }

    const edgesGeometry = new THREE.EdgesGeometry(merged, 40);
    const edgePos = edgesGeometry.getAttribute('position') as THREE.BufferAttribute;
    const edgeExpressId = new Float32Array(edgePos.count);
    const edgeHidden = new Float32Array(edgePos.count);
    for (let i = 0; i < edgePos.count; i++) {
      const key = `${edgePos.getX(i).toFixed(4)}_${edgePos.getY(i).toFixed(4)}_${edgePos.getZ(i).toFixed(4)}`;
      edgeExpressId[i] = posToExpressId.get(key) ?? -1;
    }
    edgesGeometry.setAttribute('expressId', new THREE.BufferAttribute(edgeExpressId, 1));
    edgesGeometry.setAttribute('hidden', new THREE.BufferAttribute(edgeHidden, 1));

    const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x5a5a5a, transparent: true, opacity: 0.3 });
    applyEdgeHiddenShader(edgesMaterial);
    const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
    edges.raycast = () => {};
    mesh.add(edges);

    meshes.push(mesh);
  });

  const typeGroups: TypeGroup[] = Array.from(byType.entries())
    .map(([type, ids]) => ({ type, ids }))
    .sort((a, b) => b.ids.length - a.ids.length);

  return { meshes, typeGroups, expressIdToType };
}

async function indexAllParameters(
  api: WebIFC.IfcAPI,
  modelID: number,
  expressIdToType: Map<number, string>,
  onDone: (index: ParamIndexEntry[]) => void
) {
  const paramIndex: ParamIndexEntry[] = [];
  const ids = Array.from(expressIdToType.keys());

  for (const expressId of ids) {
    try {
      const line = api.GetLine(modelID, expressId, true);
      const elementName = line.Name?.value || `#${expressId}`;
      const typeName = expressIdToType.get(expressId) ?? 'UNKNOWN';

      const psetLines = (await api.properties?.getPropertySets?.(modelID, expressId, true)) ?? [];

      for (const pset of psetLines) {
        const category = pset.Name?.value ?? 'General';
        for (const propRef of pset.HasProperties || []) {
          try {
            // propRef puede venir como el objeto de propiedad completo (con
            // Name/NominalValue directo) o como referencia numérica a resolver
            // con GetLine — depende de la versión de web-ifc.
            let propLine: any = propRef;
            if (propRef?.Name === undefined && propRef?.NominalValue === undefined) {
              const propId = typeof propRef === 'number' ? propRef : propRef?.value;
              if (typeof propId === 'number') {
                propLine = api.GetLine(modelID, propId);
              } else {
                continue;
              }
            }

            const paramName = propLine.Name?.value ?? 'Propiedad';
            const rawValue = propLine.NominalValue?.value ?? propLine.NominalValue ?? '';
            paramIndex.push({ expressId, elementName, typeName, category, paramName, paramValue: String(rawValue) });
          } catch { /* propiedad individual no disponible, se sigue con la siguiente */ }
        }
      }
    } catch { /* elemento sin propiedades legibles, se sigue sin indexar */ }
  }

  onDone(paramIndex);
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