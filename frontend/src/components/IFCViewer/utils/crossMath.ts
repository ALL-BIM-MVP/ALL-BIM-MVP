

import * as THREE from 'three';

export interface Triangle { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; }

export interface CrossArmsResult {
  center: THREE.Vector3;
  normal: THREE.Vector3;
  uAxis: THREE.Vector3;
  vAxis: THREE.Vector3;
  uPos: THREE.Vector3;
  uNeg: THREE.Vector3;
  vPos: THREE.Vector3;
  vNeg: THREE.Vector3;
}

const PLANE_EPS = 0.01;
const NORMAL_DOT_EPS = 0.999;
const FALLBACK_ARM_LEN = 0.3;



export function clipArmTipForScreen(camera: THREE.PerspectiveCamera, center: THREE.Vector3, tip: THREE.Vector3): THREE.Vector3 {
  camera.updateMatrixWorld();
  const centerView = center.clone().applyMatrix4(camera.matrixWorldInverse);
  const tipView = tip.clone().applyMatrix4(camera.matrixWorldInverse);
  
  const nearZ = -camera.near - 1e-3;
  const centerInFront = centerView.z <= nearZ;
  const tipInFront = tipView.z <= nearZ;
  if (tipInFront || !centerInFront) return tip.clone();
  const t = (nearZ - centerView.z) / (tipView.z - centerView.z);
  return center.clone().lerp(tip, t);
}

export function coplanarTrianglesFromMesh(
  mesh: THREE.Mesh,
  hitFaceIndex: number,
  hitPoint: THREE.Vector3,
  vertexRange: { start: number; end: number } | null,
  fast: boolean
): { triangles: Triangle[]; hitTriangle: Triangle } | null {
  const geom = mesh.geometry as THREE.BufferGeometry;
  const index = geom.getIndex();
  if (!index) return null;
  const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
  const matrixWorld = mesh.matrixWorld;

  const va0 = index.getX(hitFaceIndex * 3);
  const vb0 = index.getX(hitFaceIndex * 3 + 1);
  const vc0 = index.getX(hitFaceIndex * 3 + 2);
  const pA = new THREE.Vector3().fromBufferAttribute(posAttr, va0).applyMatrix4(matrixWorld);
  const pB = new THREE.Vector3().fromBufferAttribute(posAttr, vb0).applyMatrix4(matrixWorld);
  const pC = new THREE.Vector3().fromBufferAttribute(posAttr, vc0).applyMatrix4(matrixWorld);
  const hitTriangle: Triangle = { a: pA, b: pB, c: pC };

  if (fast) return { triangles: [hitTriangle], hitTriangle };

  const normal = new THREE.Vector3().subVectors(pB, pA).cross(new THREE.Vector3().subVectors(pC, pA));
  if (normal.lengthSq() < 1e-12) return { triangles: [hitTriangle], hitTriangle };
  normal.normalize();

  const triangles: Triangle[] = [];
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3(), tmpNormal = new THREE.Vector3();
  for (let t = 0; t < index.count; t += 3) {
    const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
    if (vertexRange && (a < vertexRange.start || a >= vertexRange.end)) continue;

    tmpA.fromBufferAttribute(posAttr, a).applyMatrix4(matrixWorld);
    tmpB.fromBufferAttribute(posAttr, b).applyMatrix4(matrixWorld);
    tmpC.fromBufferAttribute(posAttr, c).applyMatrix4(matrixWorld);

    tmpNormal.subVectors(tmpB, tmpA).cross(new THREE.Vector3().subVectors(tmpC, tmpA));
    if (tmpNormal.lengthSq() < 1e-12) continue;
    tmpNormal.normalize();

    if (Math.abs(tmpNormal.dot(normal)) < NORMAL_DOT_EPS) continue;
    if (Math.abs(normal.dot(tmpA.clone().sub(hitPoint))) > PLANE_EPS) continue;

    triangles.push({ a: tmpA.clone(), b: tmpB.clone(), c: tmpC.clone() });
  }
  if (triangles.length === 0) triangles.push(hitTriangle);
  return { triangles, hitTriangle };
}

export function computeCrossArms(
  hitTriangle: Triangle,
  coplanarTriangles: Triangle[],
  origin: THREE.Vector3,
  rayDirection: THREE.Vector3,
  recenter: boolean
): CrossArmsResult {
  const { a: pA, b: pB, c: pC } = hitTriangle;
  const normal = new THREE.Vector3().subVectors(pB, pA).cross(new THREE.Vector3().subVectors(pC, pA));
  normal.normalize();
  if (normal.dot(rayDirection) > 0) normal.negate();

  const edgeCount = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; count: number }>();
  const posKey = (v: THREE.Vector3) => `${v.x.toFixed(4)}_${v.y.toFixed(4)}_${v.z.toFixed(4)}`;
  const addEdge = (p1: THREE.Vector3, p2: THREE.Vector3) => {
    const k1 = posKey(p1), k2 = posKey(p2);
    const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
    const existing = edgeCount.get(key);
    if (existing) existing.count++;
    else edgeCount.set(key, { a: p1, b: p2, count: 1 });
  };
  for (const tri of coplanarTriangles) {
    addEdge(tri.a, tri.b);
    addEdge(tri.b, tri.c);
    addEdge(tri.c, tri.a);
  }
  const boundaryEdges: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  edgeCount.forEach(({ a, b, count }) => { if (count === 1) boundaryEdges.push({ a, b }); });

  let uAxis: THREE.Vector3;
  if (boundaryEdges.length > 0) {
    let longest = boundaryEdges[0];
    let longestLenSq = longest.a.distanceToSquared(longest.b);
    for (const e of boundaryEdges) {
      const lenSq = e.a.distanceToSquared(e.b);
      if (lenSq > longestLenSq) { longest = e; longestLenSq = lenSq; }
    }
    const raw = new THREE.Vector3().subVectors(longest.b, longest.a);
    uAxis = raw.clone().sub(normal.clone().multiplyScalar(raw.dot(normal))).normalize();
  } else {
    uAxis = new THREE.Vector3().subVectors(pB, pA).normalize();
  }
  const vAxis = new THREE.Vector3().crossVectors(normal, uAxis).normalize();

  const to2D = (p: THREE.Vector3) => ({ u: uAxis.dot(p.clone().sub(origin)), v: vAxis.dot(p.clone().sub(origin)) });
  const edges2D = boundaryEdges.map(({ a, b }) => ({ a: to2D(a), b: to2D(b) }));

  let faceCenterU = 0;
  let faceCenterV = 0;
  if (recenter && edges2D.length > 0) {
    let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
    for (const { a, b } of edges2D) {
      uMin = Math.min(uMin, a.u, b.u); uMax = Math.max(uMax, a.u, b.u);
      vMin = Math.min(vMin, a.v, b.v); vMax = Math.max(vMax, a.v, b.v);
    }
    faceCenterU = (uMin + uMax) / 2;
    faceCenterV = (vMin + vMax) / 2;
  }
  const faceCenter = origin.clone().addScaledVector(uAxis, faceCenterU).addScaledVector(vAxis, faceCenterV);
  const edges2DFromCenter = edges2D.map(({ a, b }) => ({
    a: { u: a.u - faceCenterU, v: a.v - faceCenterV },
    b: { u: b.u - faceCenterU, v: b.v - faceCenterV },
  }));

  const rayHit2D = (dx: number, dy: number): number | null => {
    let best: number | null = null;
    for (const { a, b } of edges2DFromCenter) {
      const ex = b.u - a.u, ey = b.v - a.v;
      const D = ex * dy - ey * dx;
      if (Math.abs(D) < 1e-9) continue;
      const t = (-ey * a.u + ex * a.v) / D;
      const s = (dx * a.v - dy * a.u) / D;
      if (t <= 1e-5 || s < -1e-6 || s > 1 + 1e-6) continue;
      if (best === null || t < best) best = t;
    }
    return best;
  };

  const tuPos = rayHit2D(1, 0);
  const tuNeg = rayHit2D(-1, 0);
  const tvPos = rayHit2D(0, 1);
  const tvNeg = rayHit2D(0, -1);

  const endPoint = (axis: THREE.Vector3, distance: number | null, sign: 1 | -1) =>
    faceCenter.clone().addScaledVector(axis, (distance ?? FALLBACK_ARM_LEN) * sign);

  return {
    center: faceCenter,
    normal,
    uAxis, vAxis,
    uPos: endPoint(uAxis, tuPos, 1),
    uNeg: endPoint(uAxis, tuNeg, -1),
    vPos: endPoint(vAxis, tvPos, 1),
    vNeg: endPoint(vAxis, tvNeg, -1),
  };
}
