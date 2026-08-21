import * as THREE from 'three';
import * as WebIFC from 'web-ifc';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getIfcTypeName } from '../utils/ifcTypeNames';

let api: WebIFC.IfcAPI | null = null;
let modelID = -1;
const entityCache = new Map<number, any>();

const DETAIL_TYPE_KEYWORDS = ['REINFORC', 'REBAR', 'TENDON', 'FASTENER', 'DISCRETEACCESSORY', 'ANCHOR', 'MECHANICALFASTENER'];
const DETAIL_COUNT_THRESHOLD = 40;
const DETAIL_CHUNK_SIZE = 300;

function isDetailType(typeName: string): boolean {
  const upper = typeName.toUpperCase();
  return DETAIL_TYPE_KEYWORDS.some((kw) => upper.includes(kw));
}

function boostSaturation(color: THREE.Color, factor: number): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const boosted = new THREE.Color();
  boosted.setHSL(hsl.h, Math.min(1, hsl.s * factor), hsl.l);
  return boosted;
}

type ColorGroup = { color: THREE.Color; opacity: number; geometries: THREE.BufferGeometry[] };

function decodeFlatMeshIntoColorGroups(flatMesh: any, target: Map<string, ColorGroup>) {
  const expressId = flatMesh.expressID;
  const placedGeometries = flatMesh.geometries;
  for (let i = 0; i < placedGeometries.size(); i++) {
    try {
      const placed = placedGeometries.get(i);
      const ifcGeom = api!.GetGeometry(modelID, placed.geometryExpressID);
      const vertexData = api!.GetVertexArray(ifcGeom.GetVertexData(), ifcGeom.GetVertexDataSize());
      const rawIndexData = api!.GetIndexArray(ifcGeom.GetIndexData(), ifcGeom.GetIndexDataSize());
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

      const c = placed.color;
      const key = `${Math.round(c.x * 255)}_${Math.round(c.y * 255)}_${Math.round(c.z * 255)}_${Math.round(c.w * 100)}`;
      if (!target.has(key)) target.set(key, { color: new THREE.Color(c.x, c.y, c.z), opacity: c.w, geometries: [] });
      target.get(key)!.geometries.push(geometry);
    } catch (err) {
      console.warn(`[worker] Geometría inválida en expressId ${expressId}:`, err);
    }
  }
}

function buildGeometryPayload({ color, opacity, geometries }: ColorGroup) {
  if (geometries.length === 0) return null;

  const posToExpressIds = new Map<string, Set<number>>();
  for (const geom of geometries) {
    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const idAttr = geom.getAttribute('expressId') as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      const key = `${posAttr.getX(i).toFixed(4)}_${posAttr.getY(i).toFixed(4)}_${posAttr.getZ(i).toFixed(4)}`;
      const id = idAttr.getX(i);
      let set = posToExpressIds.get(key);
      if (!set) { set = new Set<number>(); posToExpressIds.set(key, set); }
      set.add(id);
    }
  }

  let merged = mergeGeometries(geometries, false);
  geometries.forEach((g) => g.dispose());
  if (!merged) return null;
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

  const edgesGeometry = new THREE.EdgesGeometry(merged, 40);
  const edgePos = edgesGeometry.getAttribute('position') as THREE.BufferAttribute;
  const edgeExpressId = new Float32Array(edgePos.count);
  const edgeCandidateIds: number[][] = new Array(edgePos.count);
  for (let i = 0; i < edgePos.count; i++) {
    const key = `${edgePos.getX(i).toFixed(4)}_${edgePos.getY(i).toFixed(4)}_${edgePos.getZ(i).toFixed(4)}`;
    const candidates = posToExpressIds.get(key);
    const list = candidates ? Array.from(candidates) : [];
    edgeCandidateIds[i] = list;
    edgeExpressId[i] = list.length > 0 ? list[0] : -1;
  }

  const boosted = boostSaturation(color, 1.3);
  const position = (merged.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
  const normal = (merged.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array;
  const index = merged.getIndex()!.array as Uint32Array | Uint16Array;
  const expressId = (merged.getAttribute('expressId') as THREE.BufferAttribute).array as Float32Array;
  const edgePosition = (edgesGeometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;

  return {
    color: { r: boosted.r, g: boosted.g, b: boosted.b },
    opacity,
    position, normal, index: new Uint32Array(index), expressId,
    ranges,
    edgePosition, edgeExpressId, edgeCandidateIds,
  };
}

function classifyElements() {
  const byType = new Map<string, number[]>();
  const expressIdToType = new Map<number, string>();

  api!.StreamAllMeshes(modelID, (flatMesh: any) => {
    const expressId = flatMesh.expressID;
    let typeName = 'UNKNOWN';
    try {
      const typeCode = api!.GetLineType(modelID, expressId);
      typeName = getIfcTypeName(api!, typeCode);
    } catch { /* UNKNOWN */ }
    if (!byType.has(typeName)) byType.set(typeName, []);
    byType.get(typeName)!.push(expressId);
    expressIdToType.set(expressId, typeName);
  });

  const isDetailElement = (typeName: string): boolean =>
    isDetailType(typeName) || (byType.get(typeName)?.length ?? 0) > DETAIL_COUNT_THRESHOLD;

  const shellIds: number[] = [];
  const detailIds: number[] = [];
  expressIdToType.forEach((typeName, expressId) => {
    (isDetailElement(typeName) ? detailIds : shellIds).push(expressId);
  });

  const typeGroups = Array.from(byType.entries())
    .map(([type, ids]) => ({ type, ids }))
    .sort((a, b) => b.ids.length - a.ids.length);

  return { shellIds, detailIds, typeGroups, expressIdToType };
}

function post(msg: any, transfer: Transferable[] = []) {
  (self as any).postMessage(msg, transfer);
}

function collectTransfers(payload: any): Transferable[] {
  return [payload.position.buffer, payload.normal.buffer, payload.index.buffer, payload.expressId.buffer, payload.edgePosition.buffer, payload.edgeExpressId.buffer];
}

async function handleOpenModel(buffer: ArrayBuffer, reqId: string) {
  entityCache.clear();

  api = new WebIFC.IfcAPI();
  api.SetWasmPath('/wasm/', true);
  await api.Init(undefined, true);

  modelID = api.OpenModel(new Uint8Array(buffer), { COORDINATE_TO_ORIGIN: true, CIRCLE_SEGMENTS: 6 });
  post({ type: 'progress', reqId, percent: 45, label: 'Generando geometría (estructura principal)...' });

  const { shellIds, detailIds, typeGroups, expressIdToType } = classifyElements();

  const supportsTargetedStream = typeof (api as any).StreamMeshes === 'function';
  const shellColorGroups = new Map<string, ColorGroup>();
  if (supportsTargetedStream && shellIds.length > 0) {
    (api as any).StreamMeshes(modelID, shellIds, (fm: any) => decodeFlatMeshIntoColorGroups(fm, shellColorGroups));
  } else {
    api.StreamAllMeshes(modelID, (fm: any) => decodeFlatMeshIntoColorGroups(fm, shellColorGroups));
  }

  const shellPayloads: any[] = [];
  shellColorGroups.forEach((group) => {
    const payload = buildGeometryPayload(group);
    if (payload) shellPayloads.push(payload);
  });

  const allTransfers: Transferable[] = [];
  shellPayloads.forEach((p) => allTransfers.push(...collectTransfers(p)));

  post({
    type: 'shellReady', reqId,
    shellMeshes: shellPayloads,
    typeGroups,
    expressIdToTypeEntries: Array.from(expressIdToType.entries()),
  }, allTransfers);

  if (supportsTargetedStream && detailIds.length > 0) {
    for (let i = 0; i < detailIds.length; i += DETAIL_CHUNK_SIZE) {
      const chunk = detailIds.slice(i, i + DETAIL_CHUNK_SIZE);
      const chunkGroups = new Map<string, ColorGroup>();
      (api as any).StreamMeshes(modelID, chunk, (fm: any) => decodeFlatMeshIntoColorGroups(fm, chunkGroups));
      chunkGroups.forEach((group) => {
        const payload = buildGeometryPayload(group);
        if (payload) post({ type: 'detailMesh', reqId, mesh: payload }, collectTransfers(payload));
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  post({ type: 'detailDone', reqId });
}

async function handleIndexAllParameters(reqId: string) {
  const paramIndex: any[] = [];
  
  const relIds = api!.GetLineIDsWithType(modelID, WebIFC.IFCRELDEFINESBYPROPERTIES);
  const elementToPsets = new Map<number, any[]>();
  
  for (const relId of relIds) {
    try {
      const rel = api!.GetLine(modelID, relId);
      const relatedObjects = rel.RelatedObjects || [];
      const psetRef = rel.RelatingPropertyDefinition;
      const psetId = psetRef?.value ?? psetRef;
      if (typeof psetId !== 'number') continue;
      const psetLine = api!.GetLine(modelID, psetId);
      
      for (const objRef of relatedObjects) {
        const expressId = objRef?.value ?? objRef;
        if (typeof expressId !== 'number') continue;
        if (!elementToPsets.has(expressId)) elementToPsets.set(expressId, []);
        elementToPsets.get(expressId)!.push(psetLine);
      }
    } catch { /* sigue */ }
  }
  
  let count = 0;
  for (const [expressId, psets] of elementToPsets) {
    try {
      const line = api!.GetLine(modelID, expressId);
      const elementName = line.Name?.value || `#${expressId}`;
      const typeCode = api!.GetLineType(modelID, expressId);
      const typeName = getIfcTypeName(api!, typeCode);
      
      for (const pset of psets) {
        const category = pset.Name?.value ?? 'General';
        for (const propRef of pset.HasProperties || []) {
          try {
            let propLine: any = propRef;
            if (propRef?.Name === undefined && propRef?.NominalValue === undefined) {
              const propId = typeof propRef === 'number' ? propRef : propRef?.value;
              if (typeof propId === 'number') propLine = api!.GetLine(modelID, propId);
              else continue;
            }
            const paramName = propLine.Name?.value ?? 'Propiedad';
            const rawValue = propLine.NominalValue?.value ?? propLine.NominalValue ?? '';
            paramIndex.push({ expressId, elementName, typeName, category, paramName, paramValue: String(rawValue) });
          } catch { /* sigue */ }
        }
      }
    } catch { /* sigue */ }
    
    count++;
    if (count % 50 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  
  post({ type: 'paramIndexReady', reqId, paramIndex });
}

async function handleGetEntityDetails(expressId: number, reqId: string) {
  if (entityCache.has(expressId)) {
    post({ type: 'entityDetails', reqId, expressId, result: entityCache.get(expressId) });
    return;
  }

  try {
    const line = api!.GetLine(modelID, expressId, true);
    let typeName = '';
    try {
      const typeCode = api!.GetLineType(modelID, expressId);
      typeName = getIfcTypeName(api!, typeCode);
    } catch { /* vacío */ }

    let propertySets: any[] = [];
    try {
      const psetLines = (await api!.properties?.getPropertySets?.(modelID, expressId, true)) ?? [];
      propertySets = psetLines.map((pset: any) => ({
        name: pset.Name?.value ?? 'PropertySet',
        properties: (pset.HasProperties || []).map((propRef: any) => {
          try {
            let propLine: any = propRef;
            if (propRef?.Name === undefined && propRef?.NominalValue === undefined) {
              const propId = typeof propRef === 'number' ? propRef : propRef?.value;
              if (typeof propId === 'number') propLine = api!.GetLine(modelID, propId);
            }
            return { name: propLine.Name?.value ?? 'Propiedad', value: propLine.NominalValue?.value ?? propLine.NominalValue ?? '' };
          } catch { return { name: 'Propiedad', value: '(no disponible)' }; }
        }),
      }));
    } catch { /* vacío */ }

    let ownerHistory: any = null;
    try {
      const ownerHistoryRef = line.OwnerHistory;
      const ownerHistoryId = ownerHistoryRef?.value ?? ownerHistoryRef;
      if (typeof ownerHistoryId === 'number') {
        const ohLine = api!.GetLine(modelID, ownerHistoryId, true);
        const creationTimestamp = ohLine.CreationDate?.value;
        const creationDate = creationTimestamp ? new Date(creationTimestamp * 1000).toLocaleDateString() : '';
        let owningUser = '';
        try {
          const userRef = ohLine.OwningUser?.value ?? ohLine.OwningUser;
          if (typeof userRef === 'number') {
            const userLine = api!.GetLine(modelID, userRef, true);
            const personRef = userLine.ThePerson?.value ?? userLine.ThePerson;
            if (typeof personRef === 'number') {
              const personLine = api!.GetLine(modelID, personRef, true);
              owningUser = [personLine.GivenName?.value, personLine.FamilyName?.value].filter(Boolean).join(' ');
            }
          }
        } catch { /* vacío */ }
        let owningApplication = '';
        try {
          const appRef = ohLine.OwningApplication?.value ?? ohLine.OwningApplication;
          if (typeof appRef === 'number') {
            const appLine = api!.GetLine(modelID, appRef, true);
            owningApplication = appLine.ApplicationFullName?.value ?? '';
          }
        } catch { /* vacío */ }
        ownerHistory = { creationDate, owningUser, owningApplication };
      }
    } catch { /* vacío */ }

    let materials: string[] = [];
    try {
      const matResult = await api!.properties?.getMaterialsProperties?.(modelID, expressId, true);
      materials = (matResult ?? []).map((m: any) => m.Name?.value ?? m.Material?.Name?.value).filter(Boolean);
    } catch { /* vacío */ }

    const result = {
      name: line.Name?.value || `#${expressId}`,
      globalId: line.GlobalId?.value || '',
      description: line.Description?.value || '',
      objectType: line.ObjectType?.value || '',
      tag: line.Tag?.value || '',
      type: typeName,
      propertySets,
      ownerHistory,
      materials,
    };

    entityCache.set(expressId, result);
    post({ type: 'entityDetails', reqId, expressId, result });
  } catch (err) {
    post({ type: 'entityDetailsError', reqId, error: String(err) });
  }
}

function handleBuildGuidMap(reqId: string) {
  const map = new Map<string, number>();
  const maxId = api!.GetMaxExpressID(modelID);
  for (let id = 1; id <= maxId; id++) {
    try {
      const line = api!.GetLine(modelID, id);
      const guid = line?.GlobalId?.value;
      if (guid) map.set(guid, id);
    } catch { /* sigue */ }
  }
  post({ type: 'guidMapReady', reqId, map });
}

function handleCheckLineExists(expressId: number, reqId: string) {
  let exists = false;
  try { api!.GetLine(modelID, expressId); exists = true; } catch { exists = false; }
  post({ type: 'lineExistsResult', reqId, exists });
}

self.onmessage = async (e: MessageEvent) => {
  const { cmd, reqId } = e.data;
  try {
    if (cmd === 'openModel') await handleOpenModel(e.data.buffer, reqId);
    else if (cmd === 'getEntityDetails') await handleGetEntityDetails(e.data.expressId, reqId);
    else if (cmd === 'indexAllParams') await handleIndexAllParameters(reqId);
    else if (cmd === 'buildGuidMap') handleBuildGuidMap(reqId);
    else if (cmd === 'checkLineExists') handleCheckLineExists(e.data.expressId, reqId);
  } catch (err) {
    post({ type: 'fatalError', reqId, error: String(err) });
  }
};