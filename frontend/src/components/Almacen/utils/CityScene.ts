// src/components/Almacen/utils/CityScene.ts
// Escena 3D liviana para el modal "Ciudad": terreno + calles + almacenes
// procedurales. Controlador propio y desacoplado del visor IFC (ese está
// armado para otra cosa: BVH, raycast de medición, cámara pesada).
import * as THREE from 'three';
import { WarehouseStyle } from '../../../types/almacen.types';

// El estilo real (GET /api/warehouse-styles) solo trae colores + max_level:
// el tamaño lo elige quien coloca el almacén, entre estas 3 huellas fijas —
// "bahias" es solo un número orientativo para el panel, no viene del backend
// (el grid interior real sigue siendo DEFAULT_GRID hasta que eso se cablee).
export type WarehouseSizeKey = 'chico' | 'mediano' | 'grande';

export const WAREHOUSE_SIZES: Record<WarehouseSizeKey, { label: string; width: number; depth: number; bahias: number }> = {
  chico: { label: 'Chico', width: 6.5, depth: 4.0, bahias: 4 },
  mediano: { label: 'Mediano', width: 9.5, depth: 5.0, bahias: 6 },
  grande: { label: 'Grande', width: 13.5, depth: 6.5, bahias: 9 },
};

export const DEFAULT_WAREHOUSE_SIZE: WarehouseSizeKey = 'mediano';

export interface Footprint {
  width: number;
  depth: number;
}

export interface CitySceneCallbacks {
  onSelectHouse?: (id: string | null) => void;
  onPlaced?: (id: string, styleId: number) => void;
  onMoved?: (id: string) => void;
  onFrame?: () => void;
}

const WALL_HEIGHT = 2.8;
const ROOF_THICKNESS = 0.22;
const PARAPET_HEIGHT = 0.35;
const ROOF_OVERHANG = 0.35;

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

  /** Igual que zoom(), pero corriendo el punto de mira hacia donde apunta el cursor (ndc) — mismo
   * mecanismo que el visor de metrados (ThreeSceneController.zoom): un plano invisible e infinito que
   * pasa por el target, perpendicular a hacia dónde mira la cámara — así SIEMPRE hay un punto real
   * bajo el cursor, sin importar si ahí hay geometría o no. El corrimiento es por fracción
   * (1 - radioNuevo/radioViejo, la misma fracción en que cambió el radio), no una corrección exacta —
   * eso es lo que lo hace reversible: acercar y alejar la misma cantidad vuelve al mismo lugar. */
  zoomToward(deltaY: number, ndc: THREE.Vector2) {
    this.anim = null;
    const oldRadius = this.spherical.radius;
    const newRadius = Math.min(this.maxRadius, Math.max(this.minRadius, oldRadius * (1 + deltaY * 0.001)));

    const viewDirection = new THREE.Vector3().subVectors(this.target, this.camera.position).normalize();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewDirection, this.target);
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, hit)) {
      const shift = 1 - newRadius / oldRadius;
      this.target.lerp(hit, shift);
    }

    this.spherical.radius = newRadius;
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

let shutterTextureCache: THREE.CanvasTexture | null = null;

/** Persiana metálica corrugada horizontal (portón de carga), dibujada en canvas — franjas con
 * degradado para simular el relieve de cada lámina, más un marco lateral oscuro. */
function getShutterTexture(): THREE.CanvasTexture {
  if (shutterTextureCache) return shutterTextureCache;
  const w = 256;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#8b9096';
  ctx.fillRect(0, 0, w, h);

  const slats = 14;
  const slatH = h / slats;
  for (let i = 0; i < slats; i++) {
    const y = i * slatH;
    const grad = ctx.createLinearGradient(0, y, 0, y + slatH);
    grad.addColorStop(0, '#a3a8ad');
    grad.addColorStop(0.5, '#787d82');
    grad.addColorStop(1, '#5f6367');
    ctx.fillStyle = grad;
    ctx.fillRect(0, y, w, slatH - 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  shutterTextureCache = texture;
  return texture;
}

/** Nave industrial de techo plano: losa con parapeto (en vez de cumbrera a cuatro aguas), portón
 * corredizo de carga y una banda continua de ventanas altas cerca del techo — nada de puerta y
 * ventanitas cuadradas tipo vivienda. */
function buildHouse(style: WarehouseStyle, footprint: Footprint): { group: THREE.Group; labelAnchor: THREE.Object3D } {
  const { width, depth } = footprint;
  const group = new THREE.Group();
  group.name = 'house';

  // Zócalo / base sobreelevada, le da apoyo real al galpón en vez de flotar sobre el piso.
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
    new THREE.MeshStandardMaterial({ color: style.wall_color, roughness: 0.95 })
  );
  walls.position.y = 0.16 + WALL_HEIGHT / 2;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const wallTop = 0.16 + WALL_HEIGHT;

  // Losa de techo plana, con alero — sin ninguna cumbrera ni inclinación.
  const roofSlab = new THREE.Mesh(
    new THREE.BoxGeometry(width + ROOF_OVERHANG * 2, ROOF_THICKNESS, depth + ROOF_OVERHANG * 2),
    new THREE.MeshStandardMaterial({ color: style.roof_color, roughness: 0.75 })
  );
  roofSlab.position.y = wallTop + ROOF_THICKNESS / 2;
  roofSlab.castShadow = true;
  roofSlab.receiveShadow = true;
  group.add(roofSlab);

  // Parapeto: cajón bajo alrededor del borde de la losa, típico remate de depósito industrial.
  const parapetMat = new THREE.MeshStandardMaterial({ color: style.roof_color, roughness: 0.8 });
  const parapetY = wallTop + ROOF_THICKNESS + PARAPET_HEIGHT / 2;
  const parapetThickness = 0.1;
  const outerW = width + ROOF_OVERHANG * 2;
  const outerD = depth + ROOF_OVERHANG * 2;
  [
    { w: outerW, d: parapetThickness, x: 0, z: outerD / 2 - parapetThickness / 2 },
    { w: outerW, d: parapetThickness, x: 0, z: -(outerD / 2 - parapetThickness / 2) },
    { w: parapetThickness, d: outerD - parapetThickness * 2, x: outerW / 2 - parapetThickness / 2, z: 0 },
    { w: parapetThickness, d: outerD - parapetThickness * 2, x: -(outerW / 2 - parapetThickness / 2), z: 0 },
  ].forEach(({ w, d, x, z }) => {
    const segment = new THREE.Mesh(new THREE.BoxGeometry(w, PARAPET_HEIGHT, d), parapetMat);
    segment.position.set(x, parapetY, z);
    segment.castShadow = true;
    group.add(segment);
  });

  // Portón corredizo de carga: ancho, centrado, con textura de persiana metálica.
  const gateWidth = Math.min(width * 0.4, 3.2);
  const gateHeight = WALL_HEIGHT * 0.82;
  const gate = new THREE.Mesh(
    new THREE.BoxGeometry(gateWidth, gateHeight, 0.1),
    new THREE.MeshStandardMaterial({ map: getShutterTexture(), roughness: 0.6, metalness: 0.2 })
  );
  gate.position.set(0, 0.16 + gateHeight / 2, depth / 2 + 0.05);
  gate.castShadow = true;
  group.add(gate);
  const gateFrameMat = new THREE.MeshStandardMaterial({ color: style.wall_frame_color, roughness: 0.7 });
  const gateFrame = new THREE.Mesh(new THREE.BoxGeometry(gateWidth + 0.16, gateHeight + 0.16, 0.06), gateFrameMat);
  gateFrame.position.set(0, 0.16 + gateHeight / 2, depth / 2 + 0.015);
  group.add(gateFrame);

  // Banda continua de ventanas altas cerca del techo (iluminación tipo nave, no vivienda).
  const bandW = width - 2.2;
  const bandH = 0.55;
  const bandY = wallTop - 0.55;
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(bandW, bandH),
    new THREE.MeshStandardMaterial({ color: '#a9d3e0', roughness: 0.2, metalness: 0.1 })
  );
  glass.position.set(0, bandY, depth / 2 + 0.045);
  group.add(glass);
  const bandFrame = new THREE.Mesh(new THREE.BoxGeometry(bandW + 0.1, bandH + 0.1, 0.05), gateFrameMat);
  bandFrame.position.set(0, bandY, depth / 2 + 0.03);
  group.add(bandFrame);
  const mullions = Math.max(2, Math.round(bandW / 0.9));
  for (let i = 1; i < mullions; i++) {
    const x = -bandW / 2 + (bandW / mullions) * i;
    const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.05, bandH, 0.06), gateFrameMat);
    mullion.position.set(x, bandY, depth / 2 + 0.05);
    group.add(mullion);
  }

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(0, parapetY + PARAPET_HEIGHT / 2 + 0.3, 0);
  group.add(labelAnchor);

  // Escala puramente visual: el almacén real sigue midiendo lo que dice su footprint (así se
  // muestra en el modal y así lo usa warehouseMapping para calcular colisiones); esto solo lo hace
  // ver más grande/imponente en la escena "Ciudad", nada más.
  group.scale.setScalar(1.4);

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

let grassTextureCache: THREE.CanvasTexture | null = null;

/** Terreno neutro tipo descampado/tierra compactada (gris-beige, sin tinte verde) con parches de
 * tono + ruido fino, en vez del pasto verde de antes. */
function getGrassTexture(): THREE.CanvasTexture {
  if (grassTextureCache) return grassTextureCache;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#aca89b';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = size * (0.05 + Math.random() * 0.12);
    const lighter = Math.random() < 0.5;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, lighter ? 'rgba(188,184,172,0.3)' : 'rgba(148,144,130,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = 100 + Math.random() * 60;
    ctx.fillStyle = `rgba(${shade * 0.85},${shade * 0.83},${shade * 0.75},${0.12 + Math.random() * 0.15})`;
    ctx.fillRect(x, y, 1.5, 1.5);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  grassTextureCache = texture;
  return texture;
}

let asphaltTextureCache: THREE.CanvasTexture | null = null;

/** Asfalto con grano + línea central discontinua, en vez del rectángulo liso de antes. La línea queda
 * pintada vertical (para la calle N-S); la calle E-O usa la misma textura rotada 90°. */
function getAsphaltTexture(): THREE.CanvasTexture {
  if (asphaltTextureCache) return asphaltTextureCache;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3d4045';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 4000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const shade = 40 + Math.random() * 40;
    ctx.fillStyle = `rgba(${shade},${shade},${shade + 3},${0.2 + Math.random() * 0.3})`;
    ctx.fillRect(x, y, 1 + Math.random(), 1 + Math.random());
  }

  ctx.fillStyle = 'rgba(214,190,90,0.85)';
  const dashLen = size * 0.14;
  const gapLen = size * 0.1;
  for (let y = 0; y < size; y += dashLen + gapLen) {
    ctx.fillRect(size / 2 - 4, y, 8, dashLen);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  asphaltTextureCache = texture;
  return texture;
}

let skyTextureCache: THREE.CanvasTexture | null = null;

/** Degradé simple (celeste arriba, se aclara hacia el horizonte) en vez del color plano de fondo. */
function getSkyTexture(): THREE.CanvasTexture {
  if (skyTextureCache) return skyTextureCache;
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, '#a9c9e0');
  grad.addColorStop(0.55, '#cfe1e6');
  grad.addColorStop(1, '#eef3ee');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  skyTextureCache = texture;
  return texture;
}

/** Veredas de concreto + cordón a ambos lados de las 2 calles centrales, en 2 tramos cada una para
 * no invadir la calle transversal en el cruce (ahí las 4 esquinas quedan sin vereda, como una
 * intersección real). Devuelve roadHalf para que buildStreetFurniture ubique postes y árboles
 * justo en el borde exterior de la vereda. */
function buildSidewalks(scene: THREE.Scene, size: number, roadWidth: number, sidewalkWidth: number): { roadHalf: number } {
  const roadHalf = roadWidth / 2;
  const outerHalf = size / 2;
  const segLen = outerHalf - roadHalf;
  const segCenter = roadHalf + segLen / 2;

  const sidewalkMat = new THREE.MeshStandardMaterial({ color: '#c7c9c6', roughness: 0.95 });
  const curbMat = new THREE.MeshStandardMaterial({ color: '#9a9c99', roughness: 0.9 });

  const group = new THREE.Group();
  group.name = 'sidewalks';

  // Veredas paralelas a la calle N-S (una franja a cada lado en X, cortada arriba/abajo del cruce).
  [-1, 1].forEach((sideX) => {
    [-1, 1].forEach((sideZ) => {
      const x = sideX * (roadHalf + sidewalkWidth / 2);
      const z = sideZ * segCenter;
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(sidewalkWidth, segLen), sidewalkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(x, 0.003, z);
      walk.receiveShadow = true;
      group.add(walk);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, segLen), curbMat);
      curb.position.set(sideX * roadHalf, 0.04, z);
      group.add(curb);
    });
  });

  // Veredas paralelas a la calle E-O (una franja a cada lado en Z, cortada a los costados del cruce).
  [-1, 1].forEach((sideZ) => {
    [-1, 1].forEach((sideX) => {
      const z = sideZ * (roadHalf + sidewalkWidth / 2);
      const x = sideX * segCenter;
      const walk = new THREE.Mesh(new THREE.PlaneGeometry(segLen, sidewalkWidth), sidewalkMat);
      walk.rotation.x = -Math.PI / 2;
      walk.position.set(x, 0.003, z);
      walk.receiveShadow = true;
      group.add(walk);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.08, 0.08), curbMat);
      curb.position.set(x, 0.04, sideZ * roadHalf);
      group.add(curb);
    });
  });

  scene.add(group);
  return { roadHalf };
}

function buildGround(scene: THREE.Scene) {
  const size = 100;
  const roadWidth = 4;

  const grass = getGrassTexture().clone();
  grass.needsUpdate = true;
  grass.repeat.set(size / 3, size / 3);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({ map: grass, roughness: 1 })
  );
  ground.name = 'ground';
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const grid = new THREE.GridHelper(size, size / 1.2, '#8c8878', '#8c8878');
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.12;
  grid.position.y = 0.001;
  scene.add(grid);

  const asphaltV = getAsphaltTexture().clone();
  asphaltV.needsUpdate = true;
  asphaltV.repeat.set(roadWidth / 3, size / 3);
  const roadV = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth, size),
    new THREE.MeshStandardMaterial({ map: asphaltV, roughness: 0.9 })
  );
  roadV.rotation.x = -Math.PI / 2;
  roadV.position.y = 0.002;
  roadV.receiveShadow = true;
  scene.add(roadV);

  const asphaltH = getAsphaltTexture().clone();
  asphaltH.needsUpdate = true;
  asphaltH.center.set(0.5, 0.5);
  asphaltH.rotation = Math.PI / 2;
  asphaltH.repeat.set(size / 3, roadWidth / 3);
  const roadH = new THREE.Mesh(
    new THREE.PlaneGeometry(size, roadWidth),
    new THREE.MeshStandardMaterial({ map: asphaltH, roughness: 0.9 })
  );
  roadH.rotation.x = -Math.PI / 2;
  roadH.position.y = 0.002;
  roadH.receiveShadow = true;
  scene.add(roadH);

  buildSidewalks(scene, size, roadWidth, 1.6);
}

interface HouseEntry {
  id: string;
  styleId: number;
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
  private styles: WarehouseStyle[];
  private placingStyleId: number | null = null;
  private placingFootprint: Footprint | null = null;
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
    if (this.placingStyleId !== null) this.updateGhostPosition(e);
    if (this.movingId) this.updateMovingPosition(e);
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 6) this.movedDuringDrag = true;
    if (this.placingStyleId === null && !this.movingId) this.orbitCam.orbit(dx, dy);
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

  constructor(canvas: HTMLCanvasElement, container: HTMLElement, styles: WarehouseStyle[], callbacks: CitySceneCallbacks = {}) {
    this.canvas = canvas;
    this.container = container;
    this.styles = styles;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = getSkyTexture();
    this.scene.fog = new THREE.Fog('#cfe1e6', 70, 160);

    this.orbitCam = new SimpleOrbitCamera(container.clientWidth / Math.max(1, container.clientHeight), 5, 90);
    // Arranca alejada para ver el panorama completo al entrar, no pegada a los primeros almacenes.
    this.orbitCam.setRadius(45);

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
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    sun.shadow.camera.far = 100;
    sun.shadow.bias = -0.0015;
    this.scene.add(sun);

    buildGround(this.scene);
    this.scene.add(this.housesGroup);
    // Sin semilla: los almacenes reales los carga quien use la escena, vía loadWarehouse().

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.loop();
  }

  private getStyle(styleId: number): WarehouseStyle {
    return this.styles.find((s) => s.warehouse_style_id === styleId) ?? this.styles[0];
  }

  private addHouse(styleId: number, footprint: Footprint, position?: THREE.Vector3): string {
    const id = `h${this.nextId++}`;
    const { group, labelAnchor } = buildHouse(this.getStyle(styleId), footprint);
    if (position) group.position.copy(position);
    group.userData.houseId = id;
    this.housesGroup.add(group);
    this.houses.set(id, { id, styleId, group, labelAnchor });
    return id;
  }

  /** Arranca el modo colocación: una vista previa semitransparente del estilo/tamaño elegido sigue al cursor. */
  startPlacing(styleId: number, footprint: Footprint) {
    this.cancelPlacing();
    this.placingStyleId = styleId;
    this.placingFootprint = footprint;
    const { group } = buildHouse(this.getStyle(styleId), footprint);
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
    this.placingStyleId = null;
    this.placingFootprint = null;
  }

  getHouses(): Array<{ id: string; styleId: number }> {
    return Array.from(this.houses.values()).map(({ id, styleId }) => ({ id, styleId }));
  }

  /** Acerca la cámara a un almacén puntual — para "ver todos" desde una lista, sin tener que buscarlo a ojo en el terreno. */
  focusHouse(id: string) {
    const entry = this.houses.get(id);
    if (!entry) return;
    const pos = entry.group.position.clone();
    this.orbitCam.flyTo(pos, 10);
  }

  /** Levanta un almacén ya existente (viene del backend) en su posición, rotación y tamaño guardados. */
  loadWarehouse(id: string, styleId: number, x: number, z: number, rotationY: number, footprint: Footprint) {
    const { group, labelAnchor } = buildHouse(this.getStyle(styleId), footprint);
    group.position.set(x, 0, z);
    group.rotation.y = rotationY;
    group.userData.houseId = id;
    this.housesGroup.add(group);
    this.houses.set(id, { id, styleId, group, labelAnchor });
  }

  /** Cambia la key con la que se referencia un almacén — para pasar del id temporal al id real que devuelve el backend al crearlo. */
  remapHouseId(oldId: string, newId: string) {
    const entry = this.houses.get(oldId);
    if (!entry) return;
    entry.id = newId;
    entry.group.userData.houseId = newId;
    this.houses.delete(oldId);
    this.houses.set(newId, entry);
    if (this.movingId === oldId) this.movingId = newId;
  }

  /** Posición y rotación actuales de un almacén, para persistirlas contra el backend. */
  getHouseTransform(id: string): { x: number; z: number; rotationY: number } | null {
    const entry = this.houses.get(id);
    if (!entry) return null;
    return { x: entry.group.position.x, z: entry.group.position.z, rotationY: entry.group.rotation.y };
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

    if (this.placingStyleId !== null && this.placingFootprint && this.ghost) {
      const styleId = this.placingStyleId;
      const footprint = this.placingFootprint;
      const position = this.ghost.position.clone();
      this.cancelPlacing();
      const id = this.addHouse(styleId, footprint, position);
      this.callbacks.onPlaced?.(id, styleId);
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
