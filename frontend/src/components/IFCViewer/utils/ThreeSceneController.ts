// src/components/IFCViewer/utils/ThreeSceneController.ts
import * as THREE from 'three';
import type { ModelBounds, ViewPreset } from '../types';

const UP = new THREE.Vector3(0, 1, 0);

const STROKE_RADIUS = 0.015;
const STROKE_RADIAL_SEGMENTS = 12;

class OrbitCameraController {
  camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3(0, 0, 0);
  private spherical = new THREE.Spherical(10, Math.PI / 3, Math.PI / 4);
  private animStart: { target: THREE.Vector3; spherical: THREE.Spherical } | null = null;
  private animEnd: { target: THREE.Vector3; spherical: THREE.Spherical } | null = null;
  private animT = 1;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 10000);
    this.syncFromSpherical();
  }

  private syncFromSpherical() {
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.up.copy(UP);
    this.camera.lookAt(this.target);
  }

  orbit(deltaX: number, deltaY: number) {
    const s = 0.006;
    this.spherical.theta -= deltaX * s;
    this.spherical.phi = Math.max(0.05, Math.min(Math.PI - 0.05, this.spherical.phi - deltaY * s));
    this.syncFromSpherical();
  }

  pan(deltaX: number, deltaY: number) {
    const panSpeed = this.spherical.radius * 0.0015;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrix.extractBasis(right, up, new THREE.Vector3());
    const move = new THREE.Vector3()
      .addScaledVector(right, -deltaX * panSpeed)
      .addScaledVector(up, deltaY * panSpeed);
    this.target.add(move);
    this.syncFromSpherical();
  }

  zoom(deltaY: number) {
    const factor = Math.exp(deltaY * 0.001);
    this.spherical.radius = Math.max(0.05, Math.min(5000, this.spherical.radius * factor));
    this.syncFromSpherical();
  }

  setPresetView(preset: ViewPreset, bounds: ModelBounds) {
    const center = new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2
    );
    const size = new THREE.Vector3(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );
    const radius = Math.max(size.length() * 0.75, 1);

    const dirByPreset: Record<ViewPreset, THREE.Vector3> = {
      front: new THREE.Vector3(0, 0, 1),
      back: new THREE.Vector3(0, 0, -1),
      right: new THREE.Vector3(1, 0, 0),
      left: new THREE.Vector3(-1, 0, 0),
      top: new THREE.Vector3(0, 1, 0),
      bottom: new THREE.Vector3(0, -1, 0),
    };
    const endSpherical = new THREE.Spherical().setFromVector3(dirByPreset[preset].clone().multiplyScalar(radius));
    if (preset === 'top' || preset === 'bottom') endSpherical.phi += 0.0001;

    this.animStart = { target: this.target.clone(), spherical: this.spherical.clone() };
    this.animEnd = { target: center, spherical: endSpherical };
    this.animT = 0;
  }

  flyToPoint(point: { x: number; y: number; z: number }, radius = 5) {
    this.animStart = { target: this.target.clone(), spherical: this.spherical.clone() };
    const endSpherical = this.spherical.clone();
    endSpherical.radius = Math.max(radius, 1);
    this.animEnd = { target: new THREE.Vector3(point.x, point.y, point.z), spherical: endSpherical };
    this.animT = 0;
  }

  update(dt: number) {
    if (!this.animStart || !this.animEnd) return;
    this.animT = Math.min(1, this.animT + dt / 1.2);
    const e = 1 - Math.pow(1 - this.animT, 3);
    this.target.copy(this.animStart.target).lerp(this.animEnd.target, e);
    this.spherical.radius = THREE.MathUtils.lerp(this.animStart.spherical.radius, this.animEnd.spherical.radius, e);
    this.spherical.phi = THREE.MathUtils.lerp(this.animStart.spherical.phi, this.animEnd.spherical.phi, e);
    this.spherical.theta = THREE.MathUtils.lerp(this.animStart.spherical.theta, this.animEnd.spherical.theta, e);
    this.syncFromSpherical();
    if (this.animT >= 1) { this.animStart = null; this.animEnd = null; }
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setPosition(x: number, y: number, z: number) { this.camera.position.set(x, y, z); }
  setTarget(x: number, y: number, z: number) { this.camera.lookAt(x, y, z); }

  projectToScreen(point: { x: number; y: number; z: number }, canvasWidth: number, canvasHeight: number) {
    const v = new THREE.Vector3(point.x, point.y, point.z).project(this.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * canvasWidth, y: (-v.y * 0.5 + 0.5) * canvasHeight };
  }

  fitToBounds(bounds: ModelBounds) {
    const center = new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      (bounds.min.y + bounds.max.y) / 2,
      (bounds.min.z + bounds.max.z) / 2
    );
    const size = new THREE.Vector3(
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z
    );
    this.target.copy(center);
    this.spherical.radius = Math.max(size.length() * 0.9, 1);
    this.spherical.theta = Math.PI / 4;
    this.spherical.phi = Math.PI / 3;
    this.syncFromSpherical();
  }
}

interface ExpressIdRange { expressId: number; start: number; end: number; }

export class ThreeSceneController {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cameraController: OrbitCameraController;
  private raycaster = new THREE.Raycaster();
  private modelGroup = new THREE.Group();
  private modelBounds: ModelBounds | null = null;
  private meshes: THREE.Mesh[] = [];

  private idToLocation = new Map<number, { mesh: THREE.Mesh; start: number; end: number }[]>();

  private hiddenIds = new Set<number>();
  private isolatedIds: Set<number> | null = null;
  private selectedIds = new Set<number>();
  private clipPlane: THREE.Plane | null = null;
  private ghostedIds = new Set<number>();
  private lightBgColor: THREE.Color;
  private darkBgTexture: THREE.CanvasTexture;
  private elementMarker: THREE.Box3Helper | null = null;

  private paintStrokes = new Map<string, THREE.Mesh>();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.localClippingEnabled = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.scene.add(this.modelGroup);

    this.cameraController = new OrbitCameraController(canvas.width / Math.max(1, canvas.height));

    this.scene.add(
      new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.0),
      (() => { const l = new THREE.DirectionalLight(0xffffff, 1.0); l.position.set(5, 10, 7); return l; })(),
      (() => { const l = new THREE.DirectionalLight(0xffffff, 0.5); l.position.set(-5, 5, -7); return l; })()
    );

    this.lightBgColor = new THREE.Color('#f0f1f3');
    this.darkBgTexture = this.buildGradientTexture('#2a2e33', '#0d0f11');
  }

  setGhostedEntities(ids: Set<number>) {
    this.ghostedIds = ids;
    this.applyGhostFlags();
  }

  private applyGhostFlags() {
    for (const mesh of this.meshes) {
      const geom = mesh.geometry;
      const expressIdAttr = geom.getAttribute('expressId') as THREE.BufferAttribute;
      const ghostedAttr = geom.getAttribute('ghosted') as THREE.BufferAttribute;
      for (let i = 0; i < expressIdAttr.count; i++) {
        const id = expressIdAttr.getX(i);
        ghostedAttr.setX(i, this.ghostedIds.has(id) ? 1 : 0);
      }
      ghostedAttr.needsUpdate = true;
    }
  }

  private buildGradientTexture(topColor: string, bottomColor: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, bottomColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 2, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  async init() {}

  getCamera() { return this.cameraController; }

  showElementMarker(expressId: number) {
    this.clearElementMarker();

    const locations = this.idToLocation.get(expressId);
    if (!locations || locations.length === 0) return;

    const box = new THREE.Box3();
    const tmp = new THREE.Vector3();
    for (const { mesh, start, end } of locations) {
      const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const matrixWorld = mesh.matrixWorld;
      for (let i = start; i < end; i++) {
        tmp.fromBufferAttribute(posAttr, i).applyMatrix4(matrixWorld);
        box.expandByPoint(tmp);
      }
    }
    if (box.isEmpty()) return;

    const marker = new THREE.Box3Helper(box, new THREE.Color(0x00e5ff));
    const material = marker.material as THREE.LineBasicMaterial;
    material.depthTest = false;
    material.depthWrite = false;
    material.transparent = true;
    marker.renderOrder = 9999;

    this.scene.add(marker);
    this.elementMarker = marker;
  }

  clearElementMarker() {
    if (!this.elementMarker) return;
    this.scene.remove(this.elementMarker);
    this.elementMarker.geometry.dispose();
    (this.elementMarker.material as THREE.Material).dispose();
    this.elementMarker = null;
  }

  loadGeometry(meshes: THREE.Mesh[]) {
    for (const mesh of meshes) {
      this.modelGroup.add(mesh);
      this.meshes.push(mesh);
      const ranges = mesh.userData.expressIdRanges as ExpressIdRange[] | undefined;
      if (ranges) {
        for (const r of ranges) {
          if (!this.idToLocation.has(r.expressId)) this.idToLocation.set(r.expressId, []);
          this.idToLocation.get(r.expressId)!.push({ mesh, start: r.start, end: r.end });
        }
      }
    }
  }

  setModelBounds(bounds: ModelBounds | null) { this.modelBounds = bounds; }
  getModelBounds() { return this.modelBounds; }

  fitToView() { if (this.modelBounds) this.cameraController.fitToBounds(this.modelBounds); }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.cameraController.setAspect(width / Math.max(1, height));
  }

  requestRender() {}

  private applyVisibilityFlags() {
    for (const mesh of this.meshes) {
      const expressIdAttr = mesh.geometry.getAttribute('expressId') as THREE.BufferAttribute;
      const hiddenAttr = mesh.geometry.getAttribute('hidden') as THREE.BufferAttribute;
      for (let i = 0; i < expressIdAttr.count; i++) {
        const id = expressIdAttr.getX(i);
        const isHidden = (this.isolatedIds ? !this.isolatedIds.has(id) : false) || this.hiddenIds.has(id);
        hiddenAttr.setX(i, isHidden ? 1 : 0);
      }
      hiddenAttr.needsUpdate = true;

      const edges = mesh.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments | undefined;
      if (edges) {
        const edgeHiddenAttr = edges.geometry.getAttribute('hidden') as THREE.BufferAttribute;
        const candidatesPerVertex = (edges.userData.candidateIdsPerVertex as number[][] | undefined) ?? [];
        const isElementHidden = (id: number) =>
          (this.isolatedIds ? !this.isolatedIds.has(id) : false) || this.hiddenIds.has(id);
        const anyFilterActive = this.isolatedIds !== null || this.hiddenIds.size > 0;

        for (let i = 0; i < edgeHiddenAttr.count; i++) {
          const candidates = candidatesPerVertex[i];
          const isHidden = !candidates || candidates.length === 0
            ? anyFilterActive
            : candidates.some(isElementHidden);
          edgeHiddenAttr.setX(i, isHidden ? 1 : 0);
        }
        edgeHiddenAttr.needsUpdate = true;
      }
    }
  }
  setHiddenEntities(ids: Set<number>) { this.hiddenIds = ids; this.applyVisibilityFlags(); }

  setEdgesVisible(visible: boolean) {
    for (const mesh of this.meshes) {
      const edges = mesh.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments | undefined;
      if (edges) edges.visible = visible;
    }
  }
  setIsolatedEntities(ids: Set<number> | null) { this.isolatedIds = ids; this.applyVisibilityFlags(); }
  getHiddenIds() { return this.hiddenIds; }

  private isHitOnHiddenVertex(mesh: THREE.Mesh, faceIndex: number): boolean {
    const geom = mesh.geometry;
    const hiddenAttr = geom.getAttribute('hidden') as THREE.BufferAttribute | undefined;
    if (!hiddenAttr) return false;
    const index = geom.getIndex();
    const vIdx = index ? index.getX(faceIndex * 3) : faceIndex * 3;
    return hiddenAttr.getX(vIdx) === 1;
  }

  setSelection(ids: number[]) {
    for (const id of this.selectedIds) {
      const locations = this.idToLocation.get(id);
      if (!locations) continue;
      for (const { mesh, start, end } of locations) {
        const selectedAttr = mesh.geometry.getAttribute('selected') as THREE.BufferAttribute;
        for (let i = start; i < end; i++) selectedAttr.setX(i, 0);
        selectedAttr.needsUpdate = true;
      }
    }
    this.selectedIds = new Set(ids);
    for (const id of this.selectedIds) {
      const locations = this.idToLocation.get(id);
      if (!locations) continue;
      for (const { mesh, start, end } of locations) {
        const selectedAttr = mesh.geometry.getAttribute('selected') as THREE.BufferAttribute;
        for (let i = start; i < end; i++) selectedAttr.setX(i, 1);
        selectedAttr.needsUpdate = true;
      }
    }
  }

  private ndcFromCanvasPixels(x: number, y: number) {
    return new THREE.Vector2((x / this.canvas.width) * 2 - 1, -(y / this.canvas.height) * 2 + 1);
  }

  private findExpressIdForVertex(mesh: THREE.Mesh, vertexIndex: number): number | null {
    const ranges = mesh.userData.expressIdRanges as ExpressIdRange[] | undefined;
    if (!ranges) return null;
    let lo = 0, hi = ranges.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = ranges[mid];
      if (vertexIndex < r.start) hi = mid - 1;
      else if (vertexIndex >= r.end) lo = mid + 1;
      else return r.expressId;
    }
    return null;
  }

  getElementStats(expressId: number): { volume: number; area: number } | null {
    const locations = this.idToLocation.get(expressId);
    if (!locations || locations.length === 0) return null;

    let volume = 0;
    let area = 0;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();

    for (const { mesh, start, end } of locations) {
      const geom = mesh.geometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      const index = geom.getIndex();
      if (!index) continue;
      const matrixWorld = mesh.matrixWorld;

      for (let t = 0; t < index.count; t += 3) {
        const va = index.getX(t), vb = index.getX(t + 1), vc = index.getX(t + 2);
        if (va < start || va >= end) continue;

        a.fromBufferAttribute(posAttr, va).applyMatrix4(matrixWorld);
        b.fromBufferAttribute(posAttr, vb).applyMatrix4(matrixWorld);
        c.fromBufferAttribute(posAttr, vc).applyMatrix4(matrixWorld);

        area += b.clone().sub(a).cross(c.clone().sub(a)).length() * 0.5;
        volume += a.dot(b.clone().cross(c)) / 6;
      }
    }

    return { volume: Math.abs(volume), area };
  }

  computeFlyToElementTarget(expressId: number): { center: THREE.Vector3; radius: number; cameraPosition: THREE.Vector3 } | null {
    const locations = this.idToLocation.get(expressId);
    if (!locations || locations.length === 0) return null;

    const box = new THREE.Box3();
    const tmp = new THREE.Vector3();
    for (const { mesh, start, end } of locations) {
      const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const matrixWorld = mesh.matrixWorld;
      for (let i = start; i < end; i++) {
        tmp.fromBufferAttribute(posAttr, i).applyMatrix4(matrixWorld);
        box.expandByPoint(tmp);
      }
    }
    if (box.isEmpty()) return null;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    const radius = Math.max(size.length() * 0.8, maxDimension * 0.75, 1.5);

    const currentOffset = this.cameraController.camera.position.clone().sub(this.cameraController.target);
    const direction = currentOffset.lengthSq() > 0 ? currentOffset.normalize() : new THREE.Vector3(0, 0, 1);
    const cameraPosition = center.clone().addScaledVector(direction, radius);

    return { center, radius, cameraPosition };
  }

  getElementCenter(expressId: number): { x: number; y: number; z: number } | null {
    const result = this.computeFlyToElementTarget(expressId);
    return result ? { x: result.center.x, y: result.center.y, z: result.center.z } : null;
  }

  flyToElement(expressId: number) {
    const result = this.computeFlyToElementTarget(expressId);
    if (!result) return;
    this.cameraController.flyToPoint(
      { x: result.center.x, y: result.center.y, z: result.center.z },
      result.radius
    );
  }

  getElementsBlockingView(cameraPosition: THREE.Vector3, targetCenter: THREE.Vector3, excludeExpressId: number): number[] {
    const direction = targetCenter.clone().sub(cameraPosition);
    const distanceToTarget = direction.length();
    if (distanceToTarget < 1e-6) return [];
    direction.normalize();

    this.raycaster.set(cameraPosition, direction);
    this.raycaster.far = distanceToTarget - 0.01;
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    this.raycaster.far = Infinity;

    const blockingIds = new Set<number>();
    for (const hit of hits) {
      if (hit.faceIndex === undefined || hit.faceIndex === null) continue;
      const mesh = hit.object as THREE.Mesh;
      const index = mesh.geometry.getIndex();
      const vIdx = index ? index.getX(hit.faceIndex * 3) : hit.faceIndex * 3;
      const id = this.findExpressIdForVertex(mesh, vIdx);
      if (id !== null && id !== excludeExpressId) blockingIds.add(id);
    }
    return Array.from(blockingIds);
  }

  async pick(x: number, y: number) {
    const ndc = this.ndcFromCanvasPixels(x, y);
    this.raycaster.setFromCamera(ndc, this.cameraController.camera);
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    const hit = hits.find(
      (h) =>
        h.object.visible &&
        h.faceIndex !== undefined &&
        !this.isHitOnHiddenVertex(h.object as THREE.Mesh, h.faceIndex!)
    );
    if (!hit) return { expressId: null };

    const mesh = hit.object as THREE.Mesh;
    const index = mesh.geometry.getIndex();
    const vIdx = index ? index.getX(hit.faceIndex! * 3) : hit.faceIndex! * 3;
    const expressId = this.findExpressIdForVertex(mesh, vIdx);
    return { expressId, point: hit.point };
  }

  raycastSceneMagnetic(
    cssX: number,
    cssY: number,
    _edgeLockState?: any,
    opts: { vertexPixelThreshold?: number; edgePixelThreshold?: number; worldPrefilterRadius?: number } = {}
    ) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const pxX = cssX * scaleX;
    const pxY = cssY * scaleY;
    const mouseScreen = { x: pxX, y: pxY };

    const ndc = this.ndcFromCanvasPixels(pxX, pxY);
    this.raycaster.setFromCamera(ndc, this.cameraController.camera);
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    const hit = hits.find(
      (h) =>
        h.object.visible &&
        h.faceIndex !== undefined &&
        !this.isHitOnHiddenVertex(h.object as THREE.Mesh, h.faceIndex!)
    );
    if (!hit) return null;

    const mesh = hit.object as THREE.Mesh;
    const rawPoint = hit.point;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const index = geom.getIndex();
    if (!index) return { intersection: { point: rawPoint }, snapTarget: null, edgeLock: null };

    const hitVIdx = index.getX(hit.faceIndex! * 3);
    const hitExpressId = this.findExpressIdForVertex(mesh, hitVIdx);
    const range = hitExpressId !== null
      ? (mesh.userData.expressIdRanges as ExpressIdRange[]).find((r) => r.expressId === hitExpressId)
      : null;
    if (!range) return { intersection: { point: rawPoint }, snapTarget: null, edgeLock: null };

    const worldRadius = opts.worldPrefilterRadius ?? 2;
    const vertexPx = opts.vertexPixelThreshold ?? 12;
    const edgePx = opts.edgePixelThreshold ?? 14;
    const worldRadiusSq = worldRadius * worldRadius;

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const matrixWorld = mesh.matrixWorld;

    const projectToScreen = (p: THREE.Vector3) =>
      this.cameraController.projectToScreen({ x: p.x, y: p.y, z: p.z }, this.canvas.width, this.canvas.height);

    const tmp = new THREE.Vector3();
    const nearby: number[] = [];
    for (let i = range.start; i < range.end; i++) {
      tmp.fromBufferAttribute(posAttr, i).applyMatrix4(matrixWorld);
      if (tmp.distanceToSquared(rawPoint) <= worldRadiusSq) nearby.push(i);
    }

    let bestVertex: THREE.Vector3 | null = null;
    let bestVertexPx = Infinity;
    for (const i of nearby) {
      const p = new THREE.Vector3().fromBufferAttribute(posAttr, i).applyMatrix4(matrixWorld);
      const screen = projectToScreen(p);
      if (!screen) continue;
      const d = Math.hypot(screen.x - mouseScreen.x, screen.y - mouseScreen.y);
      if (d < bestVertexPx) { bestVertexPx = d; bestVertex = p; }
    }
    if (bestVertex && bestVertexPx <= vertexPx) {
      return {
        intersection: { point: rawPoint },
        snapTarget: { position: { x: bestVertex.x, y: bestVertex.y, z: bestVertex.z }, type: 'vertex' as const },
        edgeLock: null,
      };
    }

    let bestEdge: { a: THREE.Vector3; b: THREE.Vector3; point: THREE.Vector3; px: number } | null = null;
    const nearbySet = new Set(nearby);
    for (let t = 0; t < index.count; t += 3) {
      const va = index.getX(t), vb = index.getX(t + 1), vc = index.getX(t + 2);
      if (va < range.start || va >= range.end) continue;
      for (const [p1, p2] of [[va, vb], [vb, vc], [vc, va]] as [number, number][]) {
        if (!nearbySet.has(p1) && !nearbySet.has(p2)) continue;
        const a = new THREE.Vector3().fromBufferAttribute(posAttr, p1).applyMatrix4(matrixWorld);
        const b = new THREE.Vector3().fromBufferAttribute(posAttr, p2).applyMatrix4(matrixWorld);
        const screenA = projectToScreen(a);
        const screenB = projectToScreen(b);
        if (!screenA || !screenB) continue;

        const closest = closestOnSegment2D(mouseScreen, screenA, screenB);
        const d = Math.hypot(closest.x - mouseScreen.x, closest.y - mouseScreen.y);
        if (!bestEdge || d < bestEdge.px) {
          bestEdge = { a, b, point: a.clone().lerp(b, closest.t), px: d };
        }
      }
    }
    if (bestEdge && bestEdge.px <= edgePx) {
      return {
        intersection: { point: rawPoint },
        snapTarget: { position: { x: bestEdge.point.x, y: bestEdge.point.y, z: bestEdge.point.z }, type: 'edge' as const },
        edgeLock: {
          edge: {
            v0: { x: bestEdge.a.x, y: bestEdge.a.y, z: bestEdge.a.z },
            v1: { x: bestEdge.b.x, y: bestEdge.b.y, z: bestEdge.b.z },
          },
          meshExpressId: hitExpressId,
          shouldLock: true,
        },
      };
    }

    return { intersection: { point: rawPoint }, snapTarget: null, edgeLock: null };
  }

  // Cruz de ejes de la cara golpeada: dos brazos tangentes a la cara (u, v) que
  // llegan hasta su borde real, más un tercer brazo perpendicular que sale hacia
  // el lado VISIBLE (el que mira la cámara) y busca si hay otro elemento ahí
  // adelante — como un láser de profundidad. Si no hay nada, ese brazo es null.
  //
  // fast=true (usado durante el ARRASTRE en vivo, una vez por frame) hace
  // DOS recortes para que sea barato en elementos con muchos triángulos:
  // 1) salta el recorrido de todos los triángulos del elemento para armar
  //    el contorno exacto de la cara — usa directo el triángulo golpeado
  //    como aproximación (igual de liviano que el snap de la medición).
  // 2) salta el raycast extra de profundidad (recorre TODO el modelo).
  // Al soltar el mouse se llama una vez más con fast=false para el
  // resultado final, exacto en ambos aspectos.
  raycastFaceCross(cssX: number, cssY: number, fast = false): {
    center: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    uPos: { x: number; y: number; z: number };
    uNeg: { x: number; y: number; z: number };
    vPos: { x: number; y: number; z: number };
    vNeg: { x: number; y: number; z: number };
    depthPos: { x: number; y: number; z: number } | null;
    expressId: number | null;
   } | null {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const pxX = cssX * scaleX;
    const pxY = cssY * scaleY;

    const ndc = this.ndcFromCanvasPixels(pxX, pxY);
    this.raycaster.setFromCamera(ndc, this.cameraController.camera);
    const rayDirection = this.raycaster.ray.direction.clone();

    const hits = this.raycaster.intersectObjects(this.meshes, false);
    const hit = hits.find(
      (h) =>
        h.object.visible &&
        h.faceIndex !== undefined &&
        !this.isHitOnHiddenVertex(h.object as THREE.Mesh, h.faceIndex!)
    );
    if (!hit) return null;

    const mesh = hit.object as THREE.Mesh;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const index = geom.getIndex();
    if (!index) return null;

    const hitVIdx = index.getX(hit.faceIndex! * 3);
    const expressId = this.findExpressIdForVertex(mesh, hitVIdx);
    const range = expressId !== null
      ? (mesh.userData.expressIdRanges as ExpressIdRange[]).find((r) => r.expressId === expressId)
      : null;
    if (!range) return null;

    const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
    const matrixWorld = mesh.matrixWorld;

    const va0 = index.getX(hit.faceIndex! * 3);
    const vb0 = index.getX(hit.faceIndex! * 3 + 1);
    const vc0 = index.getX(hit.faceIndex! * 3 + 2);

    const pA = new THREE.Vector3().fromBufferAttribute(posAttr, va0).applyMatrix4(matrixWorld);
    const pB = new THREE.Vector3().fromBufferAttribute(posAttr, vb0).applyMatrix4(matrixWorld);
    const pC = new THREE.Vector3().fromBufferAttribute(posAttr, vc0).applyMatrix4(matrixWorld);

    const normal = new THREE.Vector3().subVectors(pB, pA).cross(new THREE.Vector3().subVectors(pC, pA));
    if (normal.lengthSq() < 1e-12) return null;
    normal.normalize();

    if (normal.dot(rayDirection) > 0) normal.negate();

    const origin = hit.point.clone();

    const PLANE_EPS = 0.01;
    const NORMAL_DOT_EPS = 0.999;

    type Tri = { a: number; b: number; c: number };
    const coplanarTris: Tri[] = [];

    // fast=true (durante el arrastre en vivo): saltea el recorrido de
    // TODOS los triángulos del elemento — en un elemento con miles de
    // triángulos (ej. una losa grande) ese loop es el costo real por
    // frame, no el raycast de profundidad. Se usa directo el triángulo
    // que golpeó el rayo como aproximación de la cara (igual de rápido
    // que la medición simple, que también trabaja solo cerca del punto).
    // Al soltar el mouse se recalcula completo (fast=false) para que el
    // contorno de la cara quede exacto, no aproximado.
    if (fast) {
      coplanarTris.push({ a: va0, b: vb0, c: vc0 });
    } else {
      const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
      const tmpNormal = new THREE.Vector3();

      for (let t = 0; t < index.count; t += 3) {
        const a = index.getX(t), b = index.getX(t + 1), c = index.getX(t + 2);
        if (a < range.start || a >= range.end) continue;

        tmpA.fromBufferAttribute(posAttr, a).applyMatrix4(matrixWorld);
        tmpB.fromBufferAttribute(posAttr, b).applyMatrix4(matrixWorld);
        tmpC.fromBufferAttribute(posAttr, c).applyMatrix4(matrixWorld);

        tmpNormal.subVectors(tmpB, tmpA).cross(new THREE.Vector3().subVectors(tmpC, tmpA));
        if (tmpNormal.lengthSq() < 1e-12) continue;
        tmpNormal.normalize();

        if (Math.abs(tmpNormal.dot(normal)) < NORMAL_DOT_EPS) continue;
        if (Math.abs(normal.dot(tmpA.clone().sub(origin))) > PLANE_EPS) continue;

        coplanarTris.push({ a, b, c });
      }
      if (coplanarTris.length === 0) coplanarTris.push({ a: va0, b: vb0, c: vc0 });
    }

    const edgeCount = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; count: number }>();
    const posKey = (v: THREE.Vector3) => `${v.x.toFixed(4)}_${v.y.toFixed(4)}_${v.z.toFixed(4)}`;

    const addEdge = (i1: number, i2: number) => {
      const p1 = new THREE.Vector3().fromBufferAttribute(posAttr, i1).applyMatrix4(matrixWorld);
      const p2 = new THREE.Vector3().fromBufferAttribute(posAttr, i2).applyMatrix4(matrixWorld);
      const k1 = posKey(p1), k2 = posKey(p2);
      const key = k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
      const existing = edgeCount.get(key);
      if (existing) existing.count++;
      else edgeCount.set(key, { a: p1, b: p2, count: 1 });
    };

    for (const tri of coplanarTris) {
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

    const to2D = (p: THREE.Vector3) => ({
      u: uAxis.dot(p.clone().sub(origin)),
      v: vAxis.dot(p.clone().sub(origin)),
    });
    const edges2D = boundaryEdges.map(({ a, b }) => ({ a: to2D(a), b: to2D(b) }));

    const rayHit2D = (dx: number, dy: number): number | null => {
      let best: number | null = null;
      for (const { a, b } of edges2D) {
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

    const FALLBACK = 0.3;
    const endPoint = (axis: THREE.Vector3, dist: number | null, sign: 1 | -1) => {
      const p = origin.clone().addScaledVector(axis, (dist ?? FALLBACK) * sign);
      return { x: p.x, y: p.y, z: p.z };
    };

    // 3er eje (profundidad): el raycast más caro de toda la función,
    // porque vuelve a intersectar TODO el modelo (this.meshes) desde
    // cero. Se saltea completo cuando fast=true.
    let depthPos: { x: number; y: number; z: number } | null = null;
    if (!fast) {
      const DEPTH_EPS = 1e-4;
      const depthOrigin = origin.clone().addScaledVector(normal, DEPTH_EPS);
      this.raycaster.set(depthOrigin, normal);
      const depthHits = this.raycaster.intersectObjects(this.meshes, false);
      const depthHit = depthHits.find((h) => {
        if (!h.object.visible || h.faceIndex === undefined) return false;
        if (this.isHitOnHiddenVertex(h.object as THREE.Mesh, h.faceIndex!)) return false;
        const hMesh = h.object as THREE.Mesh;
        const hIndex = hMesh.geometry.getIndex();
        if (!hIndex) return false;
        const hVIdx = hIndex.getX(h.faceIndex! * 3);
        const hExpressId = this.findExpressIdForVertex(hMesh, hVIdx);
        return hExpressId !== expressId;
      });
      depthPos = depthHit
        ? { x: depthHit.point.x, y: depthHit.point.y, z: depthHit.point.z }
        : null;
    }

    return {
      center: { x: origin.x, y: origin.y, z: origin.z },
      normal: { x: normal.x, y: normal.y, z: normal.z },
      uPos: endPoint(uAxis, tuPos, 1),
      uNeg: endPoint(uAxis, tuNeg, -1),
      vPos: endPoint(vAxis, tvPos, 1),
      vNeg: endPoint(vAxis, tvNeg, -1),
      depthPos,
      expressId,
    };
  }

  raycastSurfacePoint(cssX: number, cssY: number): { point: { x: number; y: number; z: number }; normal: { x: number; y: number; z: number } } | null {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const pxX = cssX * scaleX;
    const pxY = cssY * scaleY;

    const ndc = this.ndcFromCanvasPixels(pxX, pxY);
    this.raycaster.setFromCamera(ndc, this.cameraController.camera);
    const rayDirection = this.raycaster.ray.direction.clone();

    const hits = this.raycaster.intersectObjects(this.meshes, false);
    const hit = hits.find(
      (h) =>
        h.object.visible &&
        h.faceIndex !== undefined &&
        !this.isHitOnHiddenVertex(h.object as THREE.Mesh, h.faceIndex!)
    );
    if (!hit) return null;

    const normal = (hit.face?.normal.clone() ?? new THREE.Vector3(0, 1, 0))
      .transformDirection(hit.object.matrixWorld)
      .normalize();
    if (normal.dot(rayDirection) > 0) normal.negate();

    const OFFSET = 0.004;
    const offsetPoint = hit.point.clone().addScaledVector(normal, OFFSET);

    return {
      point: { x: offsetPoint.x, y: offsetPoint.y, z: offsetPoint.z },
      normal: { x: normal.x, y: normal.y, z: normal.z },
    };
  }

  setPaintStroke(id: string, points: { x: number; y: number; z: number }[], color: string) {
    if (points.length < 2) return;
    const vecPoints = points.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    const curve = new THREE.CatmullRomCurve3(vecPoints, false, 'catmullrom', 0.2);

    const tubularSegments = Math.max(vecPoints.length * 2, 8);
    const geometry = new THREE.TubeGeometry(curve, tubularSegments, STROKE_RADIUS, STROKE_RADIAL_SEGMENTS, false);

    const existing = this.paintStrokes.get(id);
    if (existing) {
      existing.geometry.dispose();
      existing.geometry = geometry;
      (existing.material as THREE.MeshBasicMaterial).color.set(color);
      return;
    }

    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color) });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 10;
    this.scene.add(mesh);
    this.paintStrokes.set(id, mesh);
  }

  removePaintStroke(id: string) {
    const mesh = this.paintStrokes.get(id);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    this.paintStrokes.delete(id);
  }

  clearPaintStrokes() {
    for (const id of Array.from(this.paintStrokes.keys())) this.removePaintStroke(id);
  }

  render(opts: { clearColor?: [number, number, number, number]; sectionPlane?: any } = {}) {
    if (opts.clearColor) {
      const [r, g, b] = opts.clearColor;
      const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
      this.scene.background = luminance < 0.3 ? this.darkBgTexture : this.lightBgColor;
    }

    if (opts.sectionPlane?.enabled && this.modelBounds) {
      const newPlane = this.buildClipPlane(opts.sectionPlane);
      if (!this.clipPlane || !this.clipPlane.equals(newPlane)) {
        this.clipPlane = newPlane;
        this.modelGroup.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
            (obj.material as THREE.Material).clippingPlanes = [this.clipPlane!];
          }
        });
      }
    } else if (this.clipPlane) {
      this.clipPlane = null;
      this.modelGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          (obj.material as THREE.Material).clippingPlanes = null;
        }
      });
    }

    this.renderer.render(this.scene, this.cameraController.camera);
  }

  private buildClipPlane(section: { axis: 'down' | 'front' | 'side'; position: number; flipped: boolean }): THREE.Plane {
    const bounds = this.modelBounds!;
    const axisVec: Record<string, THREE.Vector3> = {
      down: new THREE.Vector3(0, -1, 0),
      front: new THREE.Vector3(0, 0, -1),
      side: new THREE.Vector3(-1, 0, 0),
    };
    const normal = axisVec[section.axis].clone();
    if (section.flipped) normal.negate();

    const axisKey = section.axis === 'down' ? 'y' : section.axis === 'front' ? 'z' : 'x';
    const worldPos = bounds.min[axisKey] + (bounds.max[axisKey] - bounds.min[axisKey]) * (section.position / 100);
    const pointOnPlane = new THREE.Vector3(0, 0, 0);
    (pointOnPlane as any)[axisKey] = worldPos;

    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, pointOnPlane);
  }

  dispose() {
    this.modelGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => m?.dispose());
      }
      if (obj instanceof THREE.LineSegments) {
        obj.geometry.dispose();
        (obj.material as THREE.Material)?.dispose();
      }
    });
    this.darkBgTexture.dispose();
    this.renderer.dispose();
    this.clearElementMarker();
    this.clearPaintStrokes();
  }
}

function closestOnSegment2D(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return { t, x: a.x + abx * t, y: a.y + aby * t };
}