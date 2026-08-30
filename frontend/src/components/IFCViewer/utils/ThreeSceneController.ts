// src/components/IFCViewer/utils/ThreeSceneController.ts
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import type { ModelBounds, ViewPreset } from '../types';
import { coplanarTrianglesFromMesh, computeCrossArms } from './crossMath';

// Acelera el raycast de three.js con una estructura BVH: sin esto,
// this.raycaster.intersectObjects(...) recorre triángulo por triángulo
// en cada click/mousemove (selección, medición, cruz de ejes) — con
// modelos grandes eso se notaba como lag en esas herramientas. Esto
// parchea el prototipo UNA sola vez; computeBoundsTree() se llama por
// geometría en loadGeometry() más abajo.
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

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
    // this.camera.matrix/matrixWorld normalmente recién se recalculan
    // durante el traversal de renderer.render() — hasta hace poco,
    // cada mousemove/wheel disparaba SU PROPIO render() de inmediato,
    // así que esa matriz siempre estaba fresca para cuando corría la
    // reproyección (medición, popup, etc.) del siguiente frame. Al
    // sacar esos renders redundantes (fix de rendimiento, useCameraControls.ts)
    // la matriz quedó un frame atrasada respecto a la posición real de
    // la cámara — se veía como que la medición/el popup "flotaban" o
    // se atrasaban al mover la cámara. Recalcularla acá (barato, sin
    // dibujar nada) mantiene el fix de rendimiento sin este efecto
    // secundario.
    this.camera.updateMatrixWorld(true);
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

  flyToPoint(point: { x: number; y: number; z: number }, radius = 5, instant = false) {
    const targetVec = new THREE.Vector3(point.x, point.y, point.z);

    if (instant) {
      // Salto directo, sin animación — se corta cualquier vuelo en curso
      // y se posiciona la cámara ya mismo, en el mismo frame.
      this.animStart = null;
      this.animEnd = null;
      this.animT = 1;
      this.target.copy(targetVec);
      this.spherical.radius = Math.max(radius, 1);
      this.syncFromSpherical();
      return;
    }

    this.animStart = { target: this.target.clone(), spherical: this.spherical.clone() };
    const endSpherical = this.spherical.clone();
    endSpherical.radius = Math.max(radius, 1);
    this.animEnd = { target: targetVec, spherical: endSpherical };
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

  // Usados por el modo caminar (useWalkMode.ts), que actualiza posición
  // y mira POR SEPARADO cada frame — sin pasar por syncFromSpherical(),
  // así que cada uno actualiza la matriz por su cuenta (mismo motivo
  // que ahí: sin esto, la reproyección del frame usaría la matriz de
  // un frame atrás, viéndose "atrasada" respecto a la cámara real).
  setPosition(x: number, y: number, z: number) {
    this.camera.position.set(x, y, z);
    this.camera.updateMatrixWorld(true);
  }
  setTarget(x: number, y: number, z: number) {
    this.camera.lookAt(x, y, z);
    this.camera.updateMatrixWorld(true);
  }

  getDistance() { return this.spherical.radius; }

  // Reposiciona el target sin animación y sin tocar radius/theta/phi —
  // usado por la compensación exacta del panel (applyPanelCompensation),
  // que necesita mover el punto de mira sin cambiar el nivel de zoom.
  recenter(x: number, y: number, z: number) {
    this.target.set(x, y, z);
    this.syncFromSpherical();
  }

  setFromWalkState(position: { x: number; y: number; z: number }, yaw: number, pitch: number, lookDist = 5) {
    const targetX = position.x + Math.sin(yaw) * Math.cos(pitch) * lookDist;
    const targetY = position.y + Math.sin(pitch) * lookDist;
    const targetZ = position.z - Math.cos(yaw) * Math.cos(pitch) * lookDist;
    this.target.set(targetX, targetY, targetZ);
    this.spherical.setFromVector3(
      new THREE.Vector3(position.x - targetX, position.y - targetY, position.z - targetZ)
    );
    this.syncFromSpherical();
  }

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
      const expressIdAttr = geom.getAttribute('expressId') as THREE.BufferAttribute | undefined;
      const ghostedAttr = geom.getAttribute('ghosted') as THREE.BufferAttribute | undefined;
    
      if (expressIdAttr && ghostedAttr) {
        for (let i = 0; i < expressIdAttr.count; i++) {
          const id = expressIdAttr.getX(i);
          ghostedAttr.setX(i, this.ghostedIds.has(id) ? 1 : 0);
        }
        ghostedAttr.needsUpdate = true;
      }

      
      const edges = mesh.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments | undefined;
      if (edges) {
        const edgeGhostedAttr = edges.geometry.getAttribute('ghosted') as THREE.BufferAttribute | undefined;
        if (edgeGhostedAttr) {
          const candidatesPerVertex = (edges.userData.candidateIdsPerVertex as number[][] | undefined) ?? [];
          for (let i = 0; i < edgeGhostedAttr.count; i++) {
            const candidates = candidatesPerVertex[i];
            const isGhosted = !!candidates && candidates.length > 0 && candidates.every((id) => this.ghostedIds.has(id));
            edgeGhostedAttr.setX(i, isGhosted ? 1 : 0);
          }
          edgeGhostedAttr.needsUpdate = true;
        }
      }
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

  // Fase 1 real de la migración a ThatOpen/Fragments — agrega un objeto
  // ajeno (por ejemplo, model.object de @thatopen/fragments) a la
  // escena, SIN pasar por loadGeometry(): a propósito no se registra en
  // this.meshes, así que pick/raycastSceneMagnetic/etc. no lo van a
  // encontrar todavía — eso es lo que mantiene las herramientas
  // "apagadas" para este camino hasta que se evalúen una por una
  // (Fase 3), sin tener que tocar ninguna de ellas ahora.
  addExternalObject(object: THREE.Object3D) {
    this.modelGroup.add(object);
  }

  removeExternalObject(object: THREE.Object3D) {
    this.modelGroup.remove(object);
  }

  loadGeometry(meshes: THREE.Mesh[]) {
    for (const mesh of meshes) {
      // BVH para raycast rápido (selección, snap de medición, cruz de
      // ejes) — se construye una sola vez acá; la geometría (posición/
      // índice) no cambia después, solo los atributos hidden/selected/
      // ghosted, así que el árbol sigue siendo válido toda la sesión.
      mesh.geometry.computeBoundsTree();
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

  fitToView() {
    if (this.modelBounds) {
      this.cameraController.fitToBounds(this.modelBounds);

      this.panelCompensationBaseTarget = this.cameraController.target.clone();
    }
  }

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

  
  setGroupSelectionWithDimming(ids: number[]) {
    this.setSelection(ids);
    // Con un solo elemento, es una selección normal — no se atenúa nada.
    // La atenuación es exclusiva de GRUPOS de 2 o más.
    if (ids.length < 2) {
      this.clearGroupDimming();
      return;
    }
    const groupSet = new Set(ids);
    const allIds = Array.from(this.idToLocation.keys());
    const ghosted = new Set(allIds.filter((id) => !groupSet.has(id)));
    this.setGhostedEntities(ghosted);
  }

  
  clearGroupDimming() {
    if (this.ghostedIds.size === 0) return;
    this.setGhostedEntities(new Set());
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


  computeFlyToElementsTarget(expressIds: number[]): { center: THREE.Vector3; radius: number } | null {
    if (expressIds.length === 0) return null;
    const box = new THREE.Box3();
    const tmp = new THREE.Vector3();
    let found = false;

    for (const expressId of expressIds) {
      const locations = this.idToLocation.get(expressId);
      if (!locations) continue;
      for (const { mesh, start, end } of locations) {
        const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const matrixWorld = mesh.matrixWorld;
        for (let i = start; i < end; i++) {
          tmp.fromBufferAttribute(posAttr, i).applyMatrix4(matrixWorld);
          box.expandByPoint(tmp);
          found = true;
        }
      }
    }
    if (!found || box.isEmpty()) return null;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.length() * 0.75, 1.5);
    return { center, radius };
  }

  flyToElements(expressIds: number[], panelOffsetPx = 0) {
    const result = this.computeFlyToElementsTarget(expressIds);
    if (!result) return;

    
    const EXTRA_MARGIN_FACTOR = 1.2;
    const radius = result.radius * EXTRA_MARGIN_FACTOR;

    this.cameraController.flyToPoint(
      { x: result.center.x, y: result.center.y, z: result.center.z },
      radius,
      true
    );


    this.panelCompensationBaseTarget = new THREE.Vector3(result.center.x, result.center.y, result.center.z);
    this.applyPanelCompensation(panelOffsetPx);
  }

  private panelCompensationBaseTarget: THREE.Vector3 | null = null;

  applyPanelCompensation(panelOffsetPx: number) {
    if (!this.panelCompensationBaseTarget) return;

    if (panelOffsetPx <= 0) {
      const t = this.panelCompensationBaseTarget;
      this.cameraController.recenter(t.x, t.y, t.z);
      return;
    }

    const camera = this.cameraController.camera;
    const distance = this.cameraController.getDistance();
    const vFovRad = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight = 2 * distance * Math.tan(vFovRad / 2);
    const visibleWidth = visibleHeight * camera.aspect;
    const canvasWidthPx = this.canvas.width || 1;
    const worldPerPixel = visibleWidth / canvasWidthPx;
    const shiftAmount = worldPerPixel * (panelOffsetPx / 2);

    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    const forward = new THREE.Vector3();
    camera.matrix.extractBasis(right, up, forward);

    const shiftedTarget = this.panelCompensationBaseTarget.clone().addScaledVector(right, shiftAmount);
    this.cameraController.recenter(shiftedTarget.x, shiftedTarget.y, shiftedTarget.z);
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

  
  private walkThroughBoxes: THREE.Box3[] = [];

  setWalkThroughEntities(ids: Set<number>) {
    const boxes: THREE.Box3[] = [];
    const tmp = new THREE.Vector3();
    for (const id of ids) {
      const locations = this.idToLocation.get(id);
      if (!locations) continue;
      const box = new THREE.Box3();
      for (const { mesh, start, end } of locations) {
        const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
        const matrixWorld = mesh.matrixWorld;
        for (let i = start; i < end; i++) {
          tmp.fromBufferAttribute(posAttr, i).applyMatrix4(matrixWorld);
          box.expandByPoint(tmp);
        }
      }
      if (!box.isEmpty()) {
        box.expandByScalar(0.15);
        boxes.push(box);
      }
    }
    this.walkThroughBoxes = boxes;
  }

  private isPointWalkThrough(point: THREE.Vector3): boolean {
    for (const box of this.walkThroughBoxes) {
      if (box.containsPoint(point)) return true;
    }
    return false;
  }

  checkWalkCollision(
    from: { x: number; y: number; z: number },
    dirX: number,
    dirZ: number,
    distance: number,
    radius = 0.35
  ): number {
    if (distance <= 0) return 0;
    const direction = new THREE.Vector3(dirX, 0, dirZ);
    if (direction.lengthSq() < 1e-10) return distance;
    direction.normalize();

    const origin = new THREE.Vector3(from.x, from.y, from.z);
    this.raycaster.set(origin, direction);
    this.raycaster.far = distance + radius;
    const hits = this.raycaster.intersectObjects(this.meshes, false);
    this.raycaster.far = Infinity;

    const hit = hits.find((h) => {
      if (!h.object.visible || h.faceIndex === undefined) return false;
      if (this.isHitOnHiddenVertex(h.object as THREE.Mesh, h.faceIndex!)) return false;
      if (this.walkThroughBoxes.length > 0 && this.isPointWalkThrough(h.point)) return false;
      return true;
    });
    if (!hit) return distance;

    const safeDistance = Math.max(0, hit.distance - radius);
    return Math.min(distance, safeDistance);
  }

  
  findFloorHeight(x: number, z: number, referenceY?: number, maxDelta = 2.5): number | null {
    if (!this.modelBounds) return null;
    const fromY = this.modelBounds.max.y + 5; // bien arriba de todo, con margen
    const origin = new THREE.Vector3(x, fromY, z);
    const direction = new THREE.Vector3(0, -1, 0);

    this.raycaster.set(origin, direction);
    this.raycaster.far = Infinity;
    const hits = this.raycaster.intersectObjects(this.meshes, false);

    const validHits = hits.filter(
      (h) =>
        h.object.visible &&
        h.faceIndex !== undefined &&
        !this.isHitOnHiddenVertex(h.object as THREE.Mesh, h.faceIndex!)
    );
    if (validHits.length === 0) return null;

    if (referenceY === undefined) {

      return validHits[0].point.y;
    }

    let best = validHits[0];
    let bestDiff = Math.abs(best.point.y - referenceY);
    for (const h of validHits) {
      const diff = Math.abs(h.point.y - referenceY);
      if (diff < bestDiff) {
        best = h;
        bestDiff = diff;
      }
    }
    return bestDiff <= maxDelta ? best.point.y : null;
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
    opts: { vertexPixelThreshold?: number; edgePixelThreshold?: number; worldPrefilterRadius?: number; preferredExpressId?: number | null } = {}
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
    const validHits = hits.filter(
      (h) =>
        h.object.visible &&
        h.faceIndex !== undefined &&
        !this.isHitOnHiddenVertex(h.object as THREE.Mesh, h.faceIndex!)
    );

    // Mientras se arrastra un punto ya puesto (measure/cross le pasan el
    // expressId del elemento al que pertenecía ese punto), preferimos
    // quedarnos sobre ESE elemento si el rayo también lo toca — aunque
    // no sea el hit más cercano. Sin esto, mirar una cara casi de canto
    // podía hacer que el rayo "se resbale" al elemento de atrás, y el
    // punto arrastrado terminaba lejos de la superficie que se estaba
    // midiendo.
    let hit = validHits[0];
    if (opts.preferredExpressId != null) {
      const preferredHit = validHits.find((h) => {
        const mesh = h.object as THREE.Mesh;
        const index = mesh.geometry.getIndex();
        if (!index || h.faceIndex == null) return false;
        const vIdx = index.getX(h.faceIndex * 3);
        return this.findExpressIdForVertex(mesh, vIdx) === opts.preferredExpressId;
      });
      if (preferredHit) hit = preferredHit;
    }
    if (!hit) return null;

    const mesh = hit.object as THREE.Mesh;
    const rawPoint = hit.point;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const index = geom.getIndex();
    if (!index) return { intersection: { point: rawPoint }, snapTarget: null, edgeLock: null, expressId: null };

    const hitVIdx = index.getX(hit.faceIndex! * 3);
    const hitExpressId = this.findExpressIdForVertex(mesh, hitVIdx);
    const range = hitExpressId !== null
      ? (mesh.userData.expressIdRanges as ExpressIdRange[]).find((r) => r.expressId === hitExpressId)
      : null;
    if (!range) return { intersection: { point: rawPoint }, snapTarget: null, edgeLock: null, expressId: hitExpressId };

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
        expressId: hitExpressId,
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
        expressId: hitExpressId,
      };
    }

    return { intersection: { point: rawPoint }, snapTarget: null, edgeLock: null, expressId: hitExpressId };
  }

  raycastFaceCross(cssX: number, cssY: number, fast = false, recenter = true): {
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

    const hitVIdx = (mesh.geometry as THREE.BufferGeometry).getIndex()!.getX(hit.faceIndex! * 3);
    const expressId = this.findExpressIdForVertex(mesh, hitVIdx);
    const range = expressId !== null
      ? (mesh.userData.expressIdRanges as ExpressIdRange[]).find((r) => r.expressId === expressId)
      : null;
    if (!range) return null;

    // La matemática de "encontrar el contorno de la cara y calcular los
    // 4 extremos" vive en crossMath.ts, compartida con
    // useFragmentsCrossTool.ts (camino Fragments) — ver ese comentario
    // largo ahí.
    const found = coplanarTrianglesFromMesh(mesh, hit.faceIndex!, hit.point, range, fast);
    if (!found) return null;
    const arms = computeCrossArms(found.hitTriangle, found.triangles, hit.point.clone(), rayDirection, recenter);

    let depthPos: { x: number; y: number; z: number } | null = null;
    if (!fast) {
      const DEPTH_EPS = 1e-4;
      const depthOrigin = arms.center.clone().addScaledVector(arms.normal, DEPTH_EPS);
      this.raycaster.set(depthOrigin, arms.normal);
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
      center: { x: arms.center.x, y: arms.center.y, z: arms.center.z },
      normal: { x: arms.normal.x, y: arms.normal.y, z: arms.normal.z },
      uPos: { x: arms.uPos.x, y: arms.uPos.y, z: arms.uPos.z },
      uNeg: { x: arms.uNeg.x, y: arms.uNeg.y, z: arms.uNeg.z },
      vPos: { x: arms.vPos.x, y: arms.vPos.y, z: arms.vPos.z },
      vNeg: { x: arms.vNeg.x, y: arms.vNeg.y, z: arms.vNeg.z },
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

    const sp = opts.sectionPlane;
    const kind = sp?.kind ?? 'axis';

    if (sp?.enabled && kind === 'axis' && this.modelBounds) {
      const newPlane = this.buildAxisClipPlane(sp);
      this.applyClipPlane(newPlane);
    } else if (sp?.enabled && kind === 'element') {
      const newPlane = this.buildElementClipPlane(sp);
      this.applyClipPlane(newPlane);
    } else if (this.clipPlane) {
      this.applyClipPlane(null);
    }

    this.renderer.render(this.scene, this.cameraController.camera);
  }

  // Fragments arma sus mallas con VARIOS materiales por malla (uno por
  // cada definición de material distinta que aparece en ella —
  // obj.material llega como array, no un THREE.Material suelto). El
  // camino viejo (web-ifc) siempre usa un solo material por malla, así
  // que "(obj.material as THREE.Material).clippingPlanes = [...]"
  // funcionaba ahí — pero para un array eso solo le pone la propiedad
  // AL ARRAY, no a los materiales de adentro: WebGLRenderer nunca lee
  // esa propiedad puesta sobre el array, así que el corte quedaba sin
  // ningún efecto visual en el camino de Fragments, sin tirar ningún
  // error (confirmado en vivo). dispose() más abajo ya distinguía este
  // caso — acá hacía falta el mismo chequeo.
  private setClippingPlanes(material: THREE.Material | THREE.Material[], planes: THREE.Plane[] | null) {
    if (Array.isArray(material)) material.forEach((m) => { m.clippingPlanes = planes; });
    else material.clippingPlanes = planes;
  }

  private applyClipPlane(newPlane: THREE.Plane | null) {
    if (newPlane && (!this.clipPlane || !this.clipPlane.equals(newPlane))) {
      this.clipPlane = newPlane;
      this.modelGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          this.setClippingPlanes(obj.material, [this.clipPlane!]);
        }
      });
    } else if (!newPlane && this.clipPlane) {
      this.clipPlane = null;
      this.modelGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          this.setClippingPlanes(obj.material, null);
        }
      });
    }
  }

  private buildAxisClipPlane(section: { axis: 'down' | 'front' | 'side'; position: number; flipped: boolean }): THREE.Plane {
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

  private buildElementClipPlane(section: {
    origin: { x: number; y: number; z: number };
    normal: { x: number; y: number; z: number };
    offset: number;
  }): THREE.Plane {
    const normal = new THREE.Vector3(section.normal.x, section.normal.y, section.normal.z).normalize();
    const origin = new THREE.Vector3(section.origin.x, section.origin.y, section.origin.z);
    const pointOnPlane = origin.clone().addScaledVector(normal, section.offset);
    return new THREE.Plane().setFromNormalAndCoplanarPoint(normal.clone().negate(), pointOnPlane);
  }

  dispose() {
    this.modelGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.disposeBoundsTree?.();
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