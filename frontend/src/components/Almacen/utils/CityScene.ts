// src/components/Almacen/utils/CityScene.ts
// Escena 3D liviana para el modal "Ciudad": terreno + calles + almacenes
// procedurales. Controlador propio y desacoplado del visor IFC (ese está
// armado para otra cosa: BVH, raycast de medición, cámara pesada).
import * as THREE from 'three';

export type HouseType = 'chico' | 'mediano' | 'grande';

export const HOUSE_TYPE_CONFIG: Record<HouseType, { width: number; depth: number; nombre: string; bahias: number }> = {
  chico: { width: 6.6, depth: 5.0, nombre: 'Almacén Chico', bahias: 4 },
  mediano: { width: 9.5, depth: 5.0, nombre: 'Almacén Mediano', bahias: 6 },
  grande: { width: 9.5, depth: 7.1, nombre: 'Almacén Grande', bahias: 9 },
};

export interface CitySceneCallbacks {
  onSelectHouse?: (id: string | null) => void;
  onPlaced?: (id: string, type: HouseType) => void;
  onMoved?: (id: string) => void;
  onFrame?: () => void;
}

const WALL_HEIGHT = 2.8;
const ROOF_HEIGHT = 1.7;
const ROOF_OVERHANG = 0.45;

interface FlyAnim {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromRadius: number;
  toRadius: number;
  start: number;
  duration: number;
}

/** Cámara orbital simple, compartida entre la escena "Ciudad" y el interior de un almacén. */
export class SimpleOrbitCamera {
  camera: THREE.PerspectiveCamera;
  target = new THREE.Vector3(0, 0, 0);
  private spherical = new THREE.Spherical(14, Math.PI / 3.1, Math.PI / 4);
  private minRadius = 5;
  private maxRadius = 30;
  private anim: FlyAnim | null = null;

  constructor(aspect: number, minRadius = 5, maxRadius = 30) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    this.minRadius = minRadius;
    this.maxRadius = maxRadius;
    this.sync();
  }

  private sync() {
    const offset = new THREE.Vector3().setFromSpherical(this.spherical);
    this.camera.position.copy(this.target).add(offset);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
  }

  orbit(dx: number, dy: number) {
    this.anim = null;
    this.spherical.theta -= dx * 0.006;
    this.spherical.phi = Math.min(Math.PI / 2 - 0.05, Math.max(0.2, this.spherical.phi - dy * 0.006));
    this.sync();
  }

  zoom(deltaY: number) {
    this.anim = null;
    this.spherical.radius = Math.min(this.maxRadius, Math.max(this.minRadius, this.spherical.radius * (1 + deltaY * 0.001)));
    this.sync();
  }

  /** Desplaza el punto que mira la cámara (no rota, no hace zoom). */
  pan(dx: number, dy: number) {
    this.anim = null;
    const panSpeed = this.spherical.radius * 0.0016;
    const forward = new THREE.Vector3().setFromSpherical(this.spherical).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();
    this.target.addScaledVector(right, dx * panSpeed);
    this.target.addScaledVector(up, dy * panSpeed);
    this.sync();
  }

  /** Fija el radio de encuadre al instante (sin animar), p. ej. al abrir una escena nueva. */
  setRadius(radius: number) {
    this.anim = null;
    this.spherical.radius = Math.min(this.maxRadius, Math.max(this.minRadius, radius));
    this.sync();
  }

  /** Anima el target y el radio hacia un punto — el "acercarse" al elegir un estante. */
  flyTo(target: THREE.Vector3, radius: number, duration = 650) {
    this.anim = {
      fromTarget: this.target.clone(),
      toTarget: target.clone(),
      fromRadius: this.spherical.radius,
      toRadius: radius,
      start: performance.now(),
      duration,
    };
  }

  /** Llamar una vez por frame: avanza la animación de flyTo si hay una en curso. */
  update() {
    if (!this.anim) return;
    const t = Math.min(1, (performance.now() - this.anim.start) / this.anim.duration);
    const eased = 1 - Math.pow(1 - t, 3);
    this.target.lerpVectors(this.anim.fromTarget, this.anim.toTarget, eased);
    this.spherical.radius = THREE.MathUtils.lerp(this.anim.fromRadius, this.anim.toRadius, eased);
    this.sync();
    if (t >= 1) this.anim = null;
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}

/**
 * Techo a cuatro aguas real (con línea de cumbrera), no un cono estirado:
 * escalar un cono de forma no uniforme lo deforma en un rombo torcido porque
 * el escalado se aplica en espacio local ANTES de la rotación de 45°. Acá se
 * arman los triángulos a mano, sin compartir vértices entre caras, para que
 * computeVertexNormals() dé una normal plana por cara (facetas nítidas, sin
 * degradado) en vez de una normal interpolada.
 */
function buildHipRoofGeometry(width: number, depth: number, height: number, overhang: number): THREE.BufferGeometry {
  const halfW = width / 2 + overhang;
  const halfD = depth / 2 + overhang;
  // Cumbrera a 45°: si el ancho no alcanza a "ganarle" al fondo, se acorta a
  // un punto y el techo degenera en una pirámide simple (sigue siendo válido).
  const ridgeHalf = Math.max(0, halfW - halfD);

  const A = [-halfW, 0, -halfD]; // atrás-izquierda
  const B = [halfW, 0, -halfD]; // atrás-derecha
  const C = [halfW, 0, halfD]; // frente-derecha
  const D = [-halfW, 0, halfD]; // frente-izquierda
  const R1 = [-ridgeHalf, height, 0]; // cumbrera izquierda
  const R2 = [ridgeHalf, height, 0]; // cumbrera derecha

  // Cada cara en orden que deja la normal (regla de la mano derecha) apuntando
  // hacia afuera: 2 faldones largos (frente/atrás, cada uno en 2 triángulos)
  // + 2 faldones triangulares en las puntas (izquierda/derecha).
  const triangles = [
    D, C, R2,
    D, R2, R1,
    B, A, R1,
    B, R1, R2,
    A, D, R1,
    C, B, R2,
  ];

  const positions = new Float32Array(triangles.flat());
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function buildHouse(type: HouseType): { group: THREE.Group; labelAnchor: THREE.Object3D } {
  const { width, depth } = HOUSE_TYPE_CONFIG[type];
  const group = new THREE.Group();
  group.name = 'house';

  // Zócalo / base sobreelevada, le da apoyo real a la casa en vez de flotar sobre el piso.
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(width + 0.3, 0.16, depth + 0.3),
    new THREE.MeshStandardMaterial({ color: '#c7c0ae', roughness: 1 })
  );
  plinth.position.y = 0.08;
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  group.add(plinth);

  // Paredes.
  const walls = new THREE.Mesh(
    new THREE.BoxGeometry(width, WALL_HEIGHT, depth),
    new THREE.MeshStandardMaterial({ color: '#ecdfc4', roughness: 0.95 })
  );
  walls.position.y = 0.16 + WALL_HEIGHT / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const wallTop = 0.16 + WALL_HEIGHT;

  // Techo a cuatro aguas con cumbrera real (ver buildHipRoofGeometry).
  const roof = new THREE.Mesh(
    buildHipRoofGeometry(width, depth, ROOF_HEIGHT, ROOF_OVERHANG),
    new THREE.MeshStandardMaterial({ color: '#b3402c', roughness: 0.6, side: THREE.DoubleSide })
  );
  roof.position.y = wallTop;
  roof.castShadow = true;
  group.add(roof);

  // Puerta.
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 1.9, 0.08),
    new THREE.MeshStandardMaterial({ color: '#5c4128', roughness: 0.8 })
  );
  door.position.set(0, 0.16 + 0.95, depth / 2 + 0.04);
  door.castShadow = true;
  group.add(door);

  // Ventanas: marco + vidrio, dos al frente.
  const windowFrameMat = new THREE.MeshStandardMaterial({ color: '#5c4128', roughness: 0.8 });
  const windowGlassMat = new THREE.MeshStandardMaterial({ color: '#a9d3e0', roughness: 0.2, metalness: 0.1 });
  [-1, 1].forEach((side) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 0.08), windowFrameMat);
    frame.position.set(side * (width / 2 - 1.1), 0.16 + 1.7, depth / 2 + 0.04);
    frame.castShadow = true;
    group.add(frame);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.65), windowGlassMat);
    glass.position.set(side * (width / 2 - 1.1), 0.16 + 1.7, depth / 2 + 0.085);
    group.add(glass);
  });

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(0, wallTop + ROOF_HEIGHT + 0.35, 0);
  group.add(labelAnchor);

  return { group, labelAnchor };
}

/** Vuelve todos los materiales de un grupo semitransparentes, para la vista previa que sigue al cursor. */
function makeGhost(group: THREE.Group) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as any).isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const cloneMat = (m: THREE.Material) => {
      const clone = m.clone();
      clone.transparent = true;
      clone.opacity = 0.5;
      return clone;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(cloneMat)
      : cloneMat(mesh.material);
  });
}

function buildGround(scene: THREE.Scene) {
  const size = 60;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ color: '#f4f6f4', roughness: 1 })
  );
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(size, size / 1.2, '#d7e0d7', '#e6ece6');
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.6;
  grid.position.y = 0.001;
  scene.add(grid);

  const roadMat = new THREE.MeshStandardMaterial({ color: '#cddccb', roughness: 1 });
  const roadH = new THREE.Mesh(new THREE.PlaneGeometry(size, 4), roadMat);
  roadH.rotation.x = -Math.PI / 2;
  roadH.position.y = 0.002;
  roadH.receiveShadow = true;
  scene.add(roadH);

  const roadV = new THREE.Mesh(new THREE.PlaneGeometry(4, size), roadMat);
  roadV.rotation.x = -Math.PI / 2;
  roadV.position.y = 0.002;
  roadV.receiveShadow = true;
  scene.add(roadV);
}

interface HouseEntry {
  id: string;
  type: HouseType;
  group: THREE.Group;
  labelAnchor: THREE.Object3D;
}

export class CityScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private orbitCam: SimpleOrbitCamera;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private housesGroup = new THREE.Group();
  private houses = new Map<string, HouseEntry>();
  private nextId = 1;
  private resizeObserver: ResizeObserver;
  private callbacks: CitySceneCallbacks;

  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private placingType: HouseType | null = null;
  private ghost: THREE.Group | null = null;
  private lastPointer = { x: 0, y: 0 };
  private movingId: string | null = null;
  private moveOrigin: THREE.Vector3 | null = null;

  private dragging = false;
  private movedDuringDrag = false;
  private lastX = 0;
  private lastY = 0;
  // pointerup/pointermove están en window (para soportar arrastres que salen
  // del canvas), pero sin esto reaccionaban a CUALQUIER click de la página
  // (botones del panel, inputs, la X de cerrar) porque nada los limitaba al
  // canvas — eso generaba una carrera contra los onClick de React que hacía
  // fallar Mover/Rotar/Quitar de forma intermitente.
  private pointerDownOnCanvas = false;

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDownOnCanvas = true;
    this.dragging = true;
    this.movedDuringDrag = false;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent) => {
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (this.placingType) this.updateGhostPosition(e);
    if (this.movingId) this.updateMovingPosition(e);
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 6) this.movedDuringDrag = true;
    if (!this.placingType && !this.movingId) this.orbitCam.orbit(dx, dy);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.pointerDownOnCanvas) return;
    this.pointerDownOnCanvas = false;
    this.dragging = false;
    if (!this.movedDuringDrag) this.handleClick(e);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.orbitCam.zoom(e.deltaY);
  };

  constructor(canvas: HTMLCanvasElement, container: HTMLElement, callbacks: CitySceneCallbacks = {}) {
    this.canvas = canvas;
    this.container = container;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e3e8ee');

    this.orbitCam = new SimpleOrbitCamera(container.clientWidth / Math.max(1, container.clientHeight));

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);

    const ambient = new THREE.AmbientLight('#ffffff', 0.65);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight('#fff6e6', 1.1);
    sun.position.set(10, 16, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 20;
    sun.shadow.camera.bottom = -20;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);

    buildGround(this.scene);
    this.scene.add(this.housesGroup);

    // Almacén inicial, ya levantado en el centro del terreno.
    this.addHouse('chico');

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.loop();
  }

  private addHouse(type: HouseType, position?: THREE.Vector3): string {
    const id = `h${this.nextId++}`;
    const { group, labelAnchor } = buildHouse(type);
    if (position) group.position.copy(position);
    group.userData.houseId = id;
    this.housesGroup.add(group);
    this.houses.set(id, { id, type, group, labelAnchor });
    return id;
  }

  /** Arranca el modo colocación: una vista previa semitransparente del tipo elegido sigue al cursor. */
  startPlacing(type: HouseType) {
    this.cancelPlacing();
    this.placingType = type;
    const { group } = buildHouse(type);
    makeGhost(group);
    this.ghost = group;
    this.scene.add(group);
    this.updateGhostPosition();
  }

  cancelPlacing() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
      });
      this.ghost = null;
    }
    this.placingType = null;
  }

  getHouses(): Array<{ id: string; type: HouseType }> {
    return Array.from(this.houses.values()).map(({ id, type }) => ({ id, type }));
  }

  removeHouse(id: string) {
    const entry = this.houses.get(id);
    if (!entry) return;
    this.housesGroup.remove(entry.group);
    this.houses.delete(id);
    if (this.movingId === id) {
      this.movingId = null;
      this.moveOrigin = null;
    }
  }

  /** Arranca el modo mover: el almacén ya levantado sigue al cursor hasta el próximo click. */
  startMoving(id: string) {
    const entry = this.houses.get(id);
    if (!entry) return;
    this.cancelMoving();
    this.movingId = id;
    this.moveOrigin = entry.group.position.clone();
  }

  /** Cancela el modo mover, devolviendo el almacén a su posición original. */
  cancelMoving() {
    if (this.movingId && this.moveOrigin) {
      const entry = this.houses.get(this.movingId);
      entry?.group.position.copy(this.moveOrigin);
    }
    this.movingId = null;
    this.moveOrigin = null;
  }

  rotateHouse(id: string) {
    const entry = this.houses.get(id);
    if (entry) entry.group.rotation.y += Math.PI / 2;
  }

  private raycastGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.orbitCam.camera);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(this.groundPlane, point) ? point : null;
  }

  private updateGhostPosition(e?: PointerEvent) {
    if (!this.ghost) return;
    const point = this.raycastGround(e?.clientX ?? this.lastPointer.x, e?.clientY ?? this.lastPointer.y);
    if (point) this.ghost.position.set(point.x, 0, point.z);
  }

  private updateMovingPosition(e?: PointerEvent) {
    if (!this.movingId) return;
    const entry = this.houses.get(this.movingId);
    if (!entry) return;
    const point = this.raycastGround(e?.clientX ?? this.lastPointer.x, e?.clientY ?? this.lastPointer.y);
    if (point) entry.group.position.set(point.x, 0, point.z);
  }

  private handleClick(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.orbitCam.camera);

    if (this.placingType && this.ghost) {
      const type = this.placingType;
      const position = this.ghost.position.clone();
      this.cancelPlacing();
      const id = this.addHouse(type, position);
      this.callbacks.onPlaced?.(id, type);
      return;
    }

    if (this.movingId) {
      const id = this.movingId;
      this.movingId = null;
      this.moveOrigin = null;
      this.callbacks.onMoved?.(id);
      return;
    }

    const hits = raycaster.intersectObject(this.housesGroup, true);
    if (hits.length === 0) {
      this.callbacks.onSelectHouse?.(null);
      return;
    }
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData.houseId) obj = obj.parent;
    this.callbacks.onSelectHouse?.((obj?.userData.houseId as string) ?? null);
  }

  private handleResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.orbitCam.setAspect(w / h);
    this.renderer.setSize(w, h, false);
  }

  /** Posiciones en pantalla (px, relativas al contenedor) de las etiquetas flotantes de cada almacén. */
  getLabelPositions(): Array<{ id: string; x: number; y: number }> {
    const result: Array<{ id: string; x: number; y: number }> = [];
    this.houses.forEach((entry) => {
      const pos = new THREE.Vector3();
      entry.labelAnchor.getWorldPosition(pos);
      pos.project(this.orbitCam.camera);
      if (pos.z > 1) return;
      result.push({
        id: entry.id,
        x: (pos.x * 0.5 + 0.5) * this.container.clientWidth,
        y: (-pos.y * 0.5 + 0.5) * this.container.clientHeight,
      });
    });
    return result;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.orbitCam.update();
    this.renderer.render(this.scene, this.orbitCam.camera);
    this.callbacks.onFrame?.();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.renderer.dispose();
  }
}
