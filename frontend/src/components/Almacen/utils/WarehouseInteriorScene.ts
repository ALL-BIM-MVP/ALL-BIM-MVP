// src/components/Almacen/utils/WarehouseInteriorScene.ts
// Interior de un almacén: una sala real (piso + 4 paredes) más amplia que la
// huella del edificio exterior, con estantes contra sus paredes. Cámara
// orbital (igual que "Ciudad"): drag izquierdo orbita, drag derecho mueve la
// vista, rueda hace zoom. Click en un estante acerca la cámara a él.
import * as THREE from 'three';
import { HOUSE_TYPE_CONFIG, HouseType, SimpleOrbitCamera } from './CityScene';
import { loadObjectModel, loadObjectModelFromFile, ObjectCategory } from './objectModels';

export interface WarehouseInteriorCallbacks {
  onSelectBay?: (id: string | null) => void;
  onBayPlaced?: (id: string, tipoId: string) => void;
  onFrame?: () => void;
}

export interface EstanteTipo {
  id: string;
  nombre: string;
  rows: number;
  cols: number;
  color: string;
  montaje: 'pared' | 'piso';
  // Tamaño de casilla en metros: define el tamaño real del mueble (filas/columnas × esto).
  anchoCasilla?: number;
  altoCasilla?: number;
}

/** Catálogo de tipos de estante — predefinidos; el usuario puede sumar más ("Nuevo tipo de estante"). */
export const ESTANTE_TIPOS: EstanteTipo[] = [
  { id: 'cajas', nombre: 'Estante de cajas', rows: 3, cols: 4, color: '#e3bd8d', montaje: 'pared', anchoCasilla: 1, altoCasilla: 1 },
  { id: 'tubos', nombre: 'Rack de tubos', rows: 2, cols: 3, color: '#a9b4bd', montaje: 'pared', anchoCasilla: 0.9, altoCasilla: 0.9 },
  { id: 'pallets', nombre: 'Zona de pallets', rows: 2, cols: 2, color: '#e3bd8d', montaje: 'piso', anchoCasilla: 1.4, altoCasilla: 1.4 },
  { id: 'rack', nombre: 'Rack industrial', rows: 1, cols: 4, color: '#f2660a', montaje: 'pared', anchoCasilla: 1.2, altoCasilla: 1.1 },
];
export const DEFAULT_ESTANTE_TIPO_ID = ESTANTE_TIPOS[0].id;
const DEFAULT_CELL_SIZE = 1;

function getTipo(tipos: EstanteTipo[], id: string): EstanteTipo {
  return tipos.find((t) => t.id === id) ?? ESTANTE_TIPOS[0];
}

const ROOM_SCALE = 4.5; // la sala es notoriamente más grande que la huella exterior
const MIN_ROOM_WIDTH = 26;
const MIN_ROOM_DEPTH = 20;
const WALL_HEIGHT = 4.2; // ya no hay paredes reales, pero sigue marcando la altura máxima razonable de un estante
const PLACEMENT_GRID = 1; // metros — coincide con el tamaño real de cada baldosa del piso

const WALL_MARGIN = 0.6;
const MIN_BAY_DEPTH = 0.35;
const MAX_BAY_DEPTH = 1.1;
const PANEL_THICKNESS = 0.05;

/** El estante mide lo que pide su tipo (filas/columnas × tamaño de casilla), no un tamaño fijo —
 * cuantas más/más grandes casillas, más grande el mueble. Solo se achica si no entra en su pared. */
export function computeBayDims(tipo: EstanteTipo, cellSize: number): { width: number; height: number } {
  const cellW = tipo.anchoCasilla ?? DEFAULT_CELL_SIZE;
  const cellH = tipo.altoCasilla ?? DEFAULT_CELL_SIZE;
  return {
    width: Math.min(cellSize * 0.94, tipo.cols * cellW),
    height: Math.min(WALL_HEIGHT - 0.3, tipo.rows * cellH),
  };
}

/** Reparte n bahías entre las 3 paredes disponibles (la del frente queda libre, es la puerta). */
function distributeAcrossSides(n: number): [number, number, number] {
  const base = Math.floor(n / 3);
  const extra = n % 3;
  const counts: [number, number, number] = [base, base, base];
  for (let i = 0; i < extra; i++) counts[i]++;
  return counts;
}

interface BaySlot {
  index: number;
  position: THREE.Vector3;
  rotationY: number;
  cellSize: number;
}

function layoutBays(width: number, depth: number, count: number): BaySlot[] {
  const halfW = width / 2 - WALL_MARGIN;
  const halfD = depth / 2 - WALL_MARGIN;
  const [back, left, right] = distributeAcrossSides(count);
  const slots: BaySlot[] = [];
  let index = 0;

  const placeAlongX = (z: number, n: number, rotationY: number) => {
    const cell = (2 * halfW) / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      slots.push({ index: index++, position: new THREE.Vector3(-halfW + cell * (i + 0.5), 0, z), rotationY, cellSize: cell });
    }
  };
  const placeAlongZ = (x: number, n: number, rotationY: number) => {
    const cell = (2 * halfD) / Math.max(1, n);
    for (let i = 0; i < n; i++) {
      slots.push({ index: index++, position: new THREE.Vector3(x, 0, -halfD + cell * (i + 0.5)), rotationY, cellSize: cell });
    }
  };

  // rotationY hace que el frente abierto del estante (local +Z) quede mirando
  // hacia el centro de la sala, no hacia la pared que tiene atrás.
  placeAlongX(-halfD, back, 0);
  placeAlongZ(-halfW, left, Math.PI / 2);
  placeAlongZ(halfW, right, -Math.PI / 2);
  return slots;
}

const PALLET_HEIGHT = 0.16;
const PALLET_GAP = 0.08;

/** Rack industrial (parantes + vigas + tablero): una sola unidad (un bay), abierta,
 * sin fondo ni divisores — una estructura para apoyar cosas encima, no una cubículo cerrada. */
function buildIndustrialRack(slot: BaySlot, width: number, height: number, tipo: EstanteTipo): { group: THREE.Group; labelAnchor: THREE.Object3D; depth: number } {
  const group = new THREE.Group();
  const depth = Math.min(MAX_BAY_DEPTH, Math.max(MIN_BAY_DEPTH, Math.min(tipo.anchoCasilla ?? DEFAULT_CELL_SIZE, tipo.altoCasilla ?? DEFAULT_CELL_SIZE) * 1.3));
  const postSize = 0.08;
  const beamThickness = 0.1;
  const deckThickness = 0.035;
  const halfW = width / 2;
  const halfD = depth / 2;

  const postMat = new THREE.MeshStandardMaterial({ color: '#1560e0', roughness: 0.3, metalness: 0.45 });
  const beamMat = new THREE.MeshStandardMaterial({ color: tipo.color, roughness: 0.3, metalness: 0.3 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#ece7d8', roughness: 0.85 });

  const frontZ = halfD - postSize / 2;
  const backZ = -(halfD - postSize / 2);
  const feetMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.8 });
  const braceThickness = 0.035;
  const braceSegments = 4;

  [-1, 1].forEach((sx) => {
    const x = sx * (halfW - postSize / 2);

    [frontZ, backZ].forEach((z) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, height, postSize), postMat);
      post.position.set(x, height / 2, z);
      post.castShadow = true;
      post.receiveShadow = true;
      group.add(post);

      const foot = new THREE.Mesh(new THREE.CylinderGeometry(postSize * 0.75, postSize * 0.75, 0.03, 10), feetMat);
      foot.position.set(x, 0.015, z);
      group.add(foot);
    });

    // Arriostre diagonal en zigzag entre los dos parantes de esta punta —
    // sin esto se ve como dos caños sueltos, no como una estructura de rack real.
    const segH = height / braceSegments;
    for (let i = 0; i < braceSegments; i++) {
      const z0 = i % 2 === 0 ? frontZ : backZ;
      const z1 = i % 2 === 0 ? backZ : frontZ;
      const y0 = segH * i;
      const y1 = segH * (i + 1);
      const dz = z1 - z0;
      const dy = y1 - y0;
      const length = Math.hypot(dz, dy);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(braceThickness, length, braceThickness), postMat);
      brace.rotation.x = Math.atan2(dz, dy);
      brace.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
      brace.castShadow = true;
      group.add(brace);
    }
  });

  const levelH = height / tipo.rows;
  for (let r = 1; r <= tipo.rows; r++) {
    const y = levelH * r - beamThickness / 2;
    [-1, 1].forEach((sz) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(width - postSize, beamThickness, postSize * 1.3), beamMat);
      beam.position.set(0, y, sz * (halfD - postSize / 2));
      beam.castShadow = true;
      beam.receiveShadow = true;
      group.add(beam);
    });

    // Tablero macizo apoyado sobre las dos vigas — no barras: la referencia
    // es un estante de tablero (particle board), no de rejilla.
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(width - postSize * 1.6, deckThickness, depth - postSize * 1.2),
      deckMat
    );
    deck.position.set(0, y + beamThickness / 2 + deckThickness / 2, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);
  }

  group.rotation.y = slot.rotationY;
  group.position.copy(slot.position);

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(0, height + 0.3, 0);
  group.add(labelAnchor);

  return { group, labelAnchor, depth };
}

/** Zona de pallets (montaje "piso"): tarimas planas separadas sobre el piso, no un mueble de pared. */
function buildPalletZone(slot: BaySlot, width: number, depthFootprint: number, tipo: EstanteTipo): { group: THREE.Group; labelAnchor: THREE.Object3D; depth: number } {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: tipo.color, roughness: 0.8 });
  const outlineMat = new THREE.LineBasicMaterial({ color: new THREE.Color(tipo.color).multiplyScalar(0.45) });
  const cellW = width / tipo.cols;
  const cellD = depthFootprint / tipo.rows;

  for (let r = 0; r < tipo.rows; r++) {
    for (let c = 0; c < tipo.cols; c++) {
      const geom = new THREE.BoxGeometry(Math.max(0.1, cellW - PALLET_GAP), PALLET_HEIGHT, Math.max(0.1, cellD - PALLET_GAP));
      const pallet = new THREE.Mesh(geom, mat);
      pallet.position.set(-width / 2 + cellW * (c + 0.5), PALLET_HEIGHT / 2, -depthFootprint / 2 + cellD * (r + 0.5));
      pallet.castShadow = true;
      pallet.receiveShadow = true;
      group.add(pallet);

      const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geom), outlineMat);
      outline.position.copy(pallet.position);
      group.add(outline);
    }
  }

  group.rotation.y = slot.rotationY;
  group.position.copy(slot.position);

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(0, PALLET_HEIGHT + 0.3, 0);
  group.add(labelAnchor);

  return { group, labelAnchor, depth: PALLET_HEIGHT };
}

/** Estante real, con casillas abiertas (marco + fondo + repisas + divisores), no un cajón macizo. */
function buildBay(slot: BaySlot, width: number, height: number, tipo: EstanteTipo): { group: THREE.Group; labelAnchor: THREE.Object3D; depth: number } {
  if (tipo.montaje === 'piso') return buildPalletZone(slot, width, height, tipo);
  if (tipo.id === 'rack') return buildIndustrialRack(slot, width, height, tipo);

  const group = new THREE.Group();
  // La casilla es tan profunda como ancha/alta (dentro de un rango razonable),
  // para que se lea como un hueco real con volumen y no como un panel chato.
  const cellW = tipo.anchoCasilla ?? DEFAULT_CELL_SIZE;
  const cellH = tipo.altoCasilla ?? DEFAULT_CELL_SIZE;
  const depth = Math.min(MAX_BAY_DEPTH, Math.max(MIN_BAY_DEPTH, Math.min(cellW, cellH) * 0.85));
  const t = PANEL_THICKNESS;

  const frameMat = new THREE.MeshStandardMaterial({ color: tipo.color, roughness: 0.75 });
  // Fondo: mismo color, pero más oscuro — no un tono aparte — para que se lea
  // como el interior del hueco, no como una pieza distinta.
  const backMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(tipo.color).multiplyScalar(0.55), roughness: 0.85 });

  const addPanel = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  addPanel(width, t, depth, 0, height - t / 2, 0, frameMat);
  addPanel(width, t, depth, 0, t / 2, 0, frameMat);
  addPanel(t, height, depth, -width / 2 + t / 2, height / 2, 0, frameMat);
  addPanel(t, height, depth, width / 2 - t / 2, height / 2, 0, frameMat);
  addPanel(width, height, t, 0, height / 2, -depth / 2 + t / 2, backMat);

  for (let r = 1; r < tipo.rows; r++) addPanel(width, t, depth, 0, (height * r) / tipo.rows, 0, frameMat);
  for (let c = 1; c < tipo.cols; c++) addPanel(t, height, depth, -width / 2 + (width * c) / tipo.cols, height / 2, 0, frameMat);

  const outline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
    new THREE.LineBasicMaterial({ color: new THREE.Color(tipo.color).multiplyScalar(0.45) })
  );
  outline.position.y = height / 2;
  group.add(outline);

  group.rotation.y = slot.rotationY;
  group.position.copy(slot.position);

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(0, height + 0.3, 0);
  group.add(labelAnchor);

  return { group, labelAnchor, depth };
}

let concreteTextureCache: THREE.CanvasTexture | null = null;

/** Dibuja una veta de mármol como curva serpenteante (nunca una línea recta). */
function drawMarbleVein(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, x1: number, y1: number,
  width: number, alpha: number
) {
  const jitter = Math.hypot(x1 - x0, y1 - y0) * 0.12;
  const cx1 = x0 + (x1 - x0) * 0.33 + (Math.random() - 0.5) * jitter;
  const cy1 = y0 + (y1 - y0) * 0.33 + (Math.random() - 0.5) * jitter;
  const cx2 = x0 + (x1 - x0) * 0.66 + (Math.random() - 0.5) * jitter;
  const cy2 = y0 + (y1 - y0) * 0.66 + (Math.random() - 0.5) * jitter;

  ctx.strokeStyle = `rgba(148,150,153,${alpha})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
  ctx.stroke();
  return { midX: x0 + (x1 - x0) * 0.5, midY: y0 + (y1 - y0) * 0.5 };
}

/** Piso de mármol blanco tipo Carrara: vetas dibujadas sobre el lienzo entero
 * (no encerradas en cada baldosa) y el grout recién después, encima — así las
 * vetas cruzan de una baldosa a la de al lado, como en una piedra real cortada. */
function getConcreteTexture(): THREE.CanvasTexture {
  if (concreteTextureCache) return concreteTextureCache;

  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  // Nubes suaves de fondo — el mármol real no es un blanco parejo.
  for (let i = 0; i < 10; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = size * (0.2 + Math.random() * 0.3);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(210,212,214,0.08)');
    grad.addColorStop(1, 'rgba(210,212,214,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Vetas: troncos largos en una dirección general, con ramas más finas
  // saliendo a los costados — el patrón denso y ramificado de la referencia.
  const flowAngle = -0.55; // dirección diagonal dominante
  const veinCount = 26;
  for (let i = 0; i < veinCount; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const angle = flowAngle + (Math.random() - 0.5) * 0.9;
    const len = size * (0.25 + Math.random() * 0.55);
    const x0 = cx - Math.cos(angle) * len * 0.5;
    const y0 = cy - Math.sin(angle) * len * 0.5;
    const x1 = cx + Math.cos(angle) * len * 0.5;
    const y1 = cy + Math.sin(angle) * len * 0.5;
    drawMarbleVein(ctx, x0, y0, x1, y1, 1 + Math.random() * 2.2, 0.16 + Math.random() * 0.22);

    const branches = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * 2) : 0;
    for (let b = 0; b < branches; b++) {
      const t = 0.2 + Math.random() * 0.6;
      const bx = x0 + (x1 - x0) * t;
      const by = y0 + (y1 - y0) * t;
      const branchAngle = angle + (Math.random() - 0.5) * 1.4;
      const branchLen = len * (0.2 + Math.random() * 0.3);
      drawMarbleVein(
        ctx, bx, by,
        bx + Math.cos(branchAngle) * branchLen, by + Math.sin(branchAngle) * branchLen,
        0.5 + Math.random(), 0.1 + Math.random() * 0.14
      );
    }
  }

  // Grout: recién ahora, por encima de las vetas, para que estas no queden cortadas.
  const tilesPerSide = 6;
  const tileSize = size / tilesPerSide;
  ctx.strokeStyle = 'rgba(210,209,203,0.45)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= tilesPerSide; i++) {
    const p = i * tileSize;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  concreteTextureCache = texture;
  return texture;
}

/** Piso de concreto pulido real, sin paredes — la sala queda abierta por los cuatro lados. */
function buildRoom(scene: THREE.Scene, width: number, depth: number) {
  const texture = getConcreteTexture().clone();
  texture.needsUpdate = true;
  const tileSpan = 6; // metros que cubre cada repetición de la textura
  texture.repeat.set(Math.max(1, width / tileSpan), Math.max(1, depth / tileSpan));

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
}

/** Vuelve semitransparente el estante fantasma que sigue al cursor al colocar uno nuevo. */
function makeGhost(group: THREE.Group) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as any).isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const cloneMat = (m: THREE.Material) => {
      const clone = m.clone() as THREE.MeshStandardMaterial;
      clone.transparent = true;
      clone.opacity = 0.55;
      return clone;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMat) : cloneMat(mesh.material);
  });
}

/** Tiñe de verde el fantasma cuando va a engancharse/apilarse contra otro estante. */
function tintGhost(group: THREE.Group, active: boolean) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as any).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      const std = m as THREE.MeshStandardMaterial;
      if (!std.emissive) return;
      std.emissive.set(active ? '#22c55e' : '#000000');
      std.emissiveIntensity = active ? 0.6 : 0;
    });
  });
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

interface BayEntry {
  id: string;
  slot: BaySlot;
  width: number;
  height: number;
  depth: number;
  level: number; // 1 = apoyado en el piso, 2 = apilado una vez, etc.
  tipoId: string;
  group: THREE.Group;
  labelAnchor: THREE.Object3D;
}

const MAX_RACK_STACK_LEVEL = 3; // el rack industrial no aguanta más de 3 niveles apilados

export class WarehouseInteriorScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private orbitCam: SimpleOrbitCamera;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private baysGroup = new THREE.Group();
  private bays = new Map<string, BayEntry>();
  private bayCounter = 1;
  private resizeObserver: ResizeObserver;
  private callbacks: WarehouseInteriorCallbacks;

  private pointerDownOnCanvas = false;
  private dragButton = 0;
  private dragging = false;
  private movedDuringDrag = false;
  private lastX = 0;
  private lastY = 0;
  private lastPointer = { x: 0, y: 0 };

  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private ghost: THREE.Group | null = null;
  private ghostTipoId: string | null = null;
  private ghostTipos: EstanteTipo[] = ESTANTE_TIPOS;
  private ghostWidth = 0;
  private pendingSnap: { position: THREE.Vector3; rotationY: number; stackedOnId?: string } | null = null;

  private onContextMenu = (e: MouseEvent) => e.preventDefault();

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDownOnCanvas = true;
    this.dragButton = e.button;
    this.dragging = true;
    this.movedDuringDrag = false;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent) => {
    this.lastPointer = { x: e.clientX, y: e.clientY };
    if (this.ghost) this.updateGhostPosition(e);
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 6) this.movedDuringDrag = true;
    if (!this.ghost) {
      if (this.dragButton === 2) this.orbitCam.pan(dx, dy);
      else this.orbitCam.orbit(dx, dy);
    }
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.pointerDownOnCanvas) return;
    this.pointerDownOnCanvas = false;
    this.dragging = false;
    if (!this.movedDuringDrag && this.dragButton === 0) this.handleClick(e);
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.orbitCam.zoom(e.deltaY);
  };

  constructor(canvas: HTMLCanvasElement, container: HTMLElement, type: HouseType, callbacks: WarehouseInteriorCallbacks = {}) {
    this.canvas = canvas;
    this.container = container;
    this.callbacks = callbacks;

    const { width: exteriorWidth, depth: exteriorDepth, bahias } = HOUSE_TYPE_CONFIG[type];
    const roomWidth = Math.max(exteriorWidth * ROOM_SCALE, MIN_ROOM_WIDTH);
    const roomDepth = Math.max(exteriorDepth * ROOM_SCALE, MIN_ROOM_DEPTH);
    const roomSpan = Math.max(roomWidth, roomDepth);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e7ebf0');

    this.orbitCam = new SimpleOrbitCamera(
      container.clientWidth / Math.max(1, container.clientHeight),
      2.5,
      roomSpan * 1.4
    );
    this.orbitCam.target.set(0, 1.2, 0);
    this.orbitCam.setRadius(roomSpan * 0.85);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);

    const ambient = new THREE.AmbientLight('#ffffff', 0.9);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight('#fff6e6', 1.3);
    sun.position.set(8, 14, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);
    // Luz de relleno del lado opuesto, para que el fondo de las casillas no
    // quede tan oscuro/parejo — sin ella se pierde el detalle ahí adentro.
    const fill = new THREE.DirectionalLight('#dce6f5', 0.5);
    fill.position.set(-6, 5, -8);
    this.scene.add(fill);

    buildRoom(this.scene, roomWidth, roomDepth);

    this.scene.add(this.baysGroup);
    layoutBays(roomWidth, roomDepth, bahias).forEach((slot) => {
      const id = `b${slot.index + 1}`;
      const tipo = getTipo(ESTANTE_TIPOS, DEFAULT_ESTANTE_TIPO_ID);
      const { width, height } = computeBayDims(tipo, slot.cellSize);
      const { group, labelAnchor, depth } = buildBay(slot, width, height, tipo);
      group.userData.bayId = id;
      this.baysGroup.add(group);
      this.bays.set(id, { id, slot, width, height, depth, level: 1, tipoId: DEFAULT_ESTANTE_TIPO_ID, group, labelAnchor });
    });
    this.bayCounter = bahias + 1;

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.loop();
  }

  getBayIds(): string[] {
    return Array.from(this.bays.keys());
  }

  getBayTipoId(id: string): string | undefined {
    return this.bays.get(id)?.tipoId;
  }

  /** Reconstruye el estante con otro tipo (cambia filas/columnas, tamaño y color). */
  setBayTipo(id: string, tipoId: string, tipos: EstanteTipo[] = ESTANTE_TIPOS) {
    const entry = this.bays.get(id);
    if (!entry) return;
    this.baysGroup.remove(entry.group);
    disposeObject3D(entry.group);
    const tipo = getTipo(tipos, tipoId);
    const { width, height } = computeBayDims(tipo, entry.slot.cellSize);
    const { group, labelAnchor, depth } = buildBay(entry.slot, width, height, tipo);
    group.userData.bayId = id;
    this.baysGroup.add(group);
    entry.group = group;
    entry.labelAnchor = labelAnchor;
    entry.width = width;
    entry.height = height;
    entry.depth = depth;
    entry.tipoId = tipoId;
  }

  /** Saca un estante ya puesto — lo que tenga apilado arriba se queda flotando,
   * no se borra en cadena (el usuario ve el problema y decide qué hacer). */
  removeBay(id: string) {
    const entry = this.bays.get(id);
    if (!entry) return;
    this.baysGroup.remove(entry.group);
    disposeObject3D(entry.group);
    this.bays.delete(id);
  }

  /** Arranca el modo colocación: un estante fantasma sigue al cursor sobre el
   * piso, y se engancha (mismo tipo, al costado) o apila (encima de cualquiera)
   * si queda cerca de otro ya puesto. */
  startPlacingNewBay(tipoId: string, tipos: EstanteTipo[] = ESTANTE_TIPOS) {
    this.cancelPlacingNewBay();
    const tipo = getTipo(tipos, tipoId);
    const slot: BaySlot = { index: 0, position: new THREE.Vector3(0, 0, 0), rotationY: 0, cellSize: Infinity };
    const { width, height } = computeBayDims(tipo, slot.cellSize);
    const { group } = buildBay(slot, width, height, tipo);
    makeGhost(group);
    this.ghost = group;
    this.ghostTipoId = tipoId;
    this.ghostTipos = tipos;
    this.ghostWidth = width;
    this.scene.add(group);
    this.updateGhostPosition();
  }

  cancelPlacingNewBay() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      disposeObject3D(this.ghost);
      this.ghost = null;
    }
    this.ghostTipoId = null;
    this.pendingSnap = null;
  }

  /** Punto donde "apunta" el mouse para colocar — primero contra los estantes
   * reales (así apuntar arriba de un 2do nivel funciona desde cualquier ángulo
   * de cámara, no solo mirando casi derecho hacia abajo) y si no contra el piso. */
  private raycastPlacementPoint(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.orbitCam.camera);

    const hits = raycaster.intersectObject(this.baysGroup, true);
    if (hits.length > 0) return hits[0].point;

    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(this.groundPlane, point) ? point : null;
  }

  /** Busca un "socket": apilar encima de cualquier estante si el punto cae
   * sobre su huella, o engancharse al costado de uno del mismo tipo si queda cerca. */
  private computeSnap(point: THREE.Vector3): { position: THREE.Vector3; rotationY: number; stackedOnId?: string } | null {
    const STACK_MARGIN = 0.35;
    const SIDE_SNAP_DIST = 0.9;
    const up = new THREE.Vector3(0, 1, 0);
    let sideCandidate: { dist: number; position: THREE.Vector3; rotationY: number } | null = null;
    // El de más arriba de la torre en esta huella, sea o no topeado — hay que
    // saber CUÁL es el techo real antes de decidir si se puede apilar ahí o no.
    let topEntry: BayEntry | null = null;
    let topY = -Infinity;

    for (const entry of this.bays.values()) {
      const local = point.clone().sub(entry.slot.position).applyAxisAngle(up, -entry.slot.rotationY);
      const withinFootprint = Math.abs(local.x) < entry.width / 2 + STACK_MARGIN && Math.abs(local.z) < entry.depth / 2 + STACK_MARGIN;
      if (withinFootprint) {
        // Altura ABSOLUTA del techo (posición + altura propia) — entry.height
        // solo es la altura propia del mueble, igual en todos los niveles, así
        // que compararla sola siempre empataba y se quedaba con el de abajo.
        const entryTopY = entry.slot.position.y + entry.height;
        if (entryTopY > topY) {
          topY = entryTopY;
          topEntry = entry;
        }
        continue;
      }
      if (entry.tipoId !== this.ghostTipoId) continue;
      const alongDir = new THREE.Vector3(1, 0, 0).applyAxisAngle(up, entry.slot.rotationY);
      for (const side of [1, -1]) {
        const candidate = entry.slot.position
          .clone()
          .addScaledVector(alongDir, side * (entry.width / 2 + this.ghostWidth / 2))
          .setY(0);
        const dist = point.distanceTo(candidate);
        if (dist < SIDE_SNAP_DIST && (!sideCandidate || dist < sideCandidate.dist)) {
          sideCandidate = { dist, position: candidate, rotationY: entry.slot.rotationY };
        }
      }
    }

    // Si el techo real de la torre ya está topeado (rack en su nivel máximo),
    // NO se ofrece apilar acá — ni ahí arriba ni "bajar" al nivel anterior,
    // que es donde ya está parado el que la topea.
    if (topEntry) {
      const rackCapped = topEntry.tipoId === 'rack' && topEntry.level >= MAX_RACK_STACK_LEVEL;
      if (!rackCapped) {
        return { position: topEntry.slot.position.clone().setY(topY), rotationY: topEntry.slot.rotationY, stackedOnId: topEntry.id };
      }
      return null;
    }
    // Apilar tiene prioridad sobre engancharse al costado.
    return sideCandidate ? { position: sideCandidate.position, rotationY: sideCandidate.rotationY } : null;
  }

  private updateGhostPosition(e?: PointerEvent) {
    if (!this.ghost) return;
    const point = this.raycastPlacementPoint(e?.clientX ?? this.lastPointer.x, e?.clientY ?? this.lastPointer.y);
    if (!point) return;
    const snap = this.computeSnap(point);
    if (snap) {
      this.ghost.position.copy(snap.position);
      this.ghost.rotation.y = snap.rotationY;
    } else {
      // Sin nada cerca para engancharse: igual queda en un lugar fijo, alineado
      // a la grilla del piso (cada baldosa mide 1 metro), no en cualquier punto.
      this.ghost.position.set(
        Math.round(point.x / PLACEMENT_GRID) * PLACEMENT_GRID,
        0,
        Math.round(point.z / PLACEMENT_GRID) * PLACEMENT_GRID
      );
      this.ghost.rotation.y = 0;
    }
    tintGhost(this.ghost, !!snap);
    this.pendingSnap = snap;
  }

  private finalizePlacingNewBay() {
    if (!this.ghost || !this.ghostTipoId) return;
    const tipoId = this.ghostTipoId;
    const tipo = getTipo(this.ghostTipos, tipoId);
    const stackedOnId = this.pendingSnap?.stackedOnId;
    const baseEntry = stackedOnId ? this.bays.get(stackedOnId) : undefined;
    const level = baseEntry ? baseEntry.level + 1 : 1;
    const slot: BaySlot = {
      index: 0,
      position: this.ghost.position.clone(),
      rotationY: this.ghost.rotation.y,
      cellSize: Infinity,
    };
    const { width, height } = computeBayDims(tipo, slot.cellSize);
    const { group, labelAnchor, depth } = buildBay(slot, width, height, tipo);
    const id = `b${this.bayCounter++}`;
    group.userData.bayId = id;
    this.baysGroup.add(group);
    this.bays.set(id, { id, slot, width, height, depth, level, tipoId, group, labelAnchor });
    this.cancelPlacingNewBay();
    this.callbacks.onBayPlaced?.(id, tipoId);
  }

  /** Acerca la cámara al estante elegido. */
  focusBay(id: string) {
    const entry = this.bays.get(id);
    if (!entry) return;
    const pos = entry.group.position.clone();
    pos.y = entry.height * 0.5;
    this.orbitCam.flyTo(pos, Math.max(3.5, entry.height * 1.8));
  }

  private handleClick(e: PointerEvent) {
    if (this.ghost) {
      this.finalizePlacingNewBay();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.orbitCam.camera);
    const hits = raycaster.intersectObject(this.baysGroup, true);
    if (hits.length === 0) {
      this.callbacks.onSelectBay?.(null);
      return;
    }
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && !obj.userData.bayId) obj = obj.parent;
    const id = (obj?.userData.bayId as string) ?? null;
    if (id) this.focusBay(id);
    this.callbacks.onSelectBay?.(id);
  }

  private handleResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.orbitCam.setAspect(w / h);
    this.renderer.setSize(w, h, false);
  }

  getLabelPositions(): Array<{ id: string; x: number; y: number; scale: number }> {
    const result: Array<{ id: string; x: number; y: number; scale: number }> = [];
    const worldPos = new THREE.Vector3();
    this.bays.forEach((entry) => {
      entry.labelAnchor.getWorldPosition(worldPos);
      const distance = this.orbitCam.camera.position.distanceTo(worldPos);
      const pos = worldPos.clone().project(this.orbitCam.camera);
      if (pos.z > 1) return;
      // Se achica de verdad con la distancia (como un cartel real en la sala),
      // no un tamaño de pantalla fijo — REF_DISTANCE es donde queda en escala 1.
      const REF_DISTANCE = 8;
      const scale = Math.min(1.3, Math.max(0.35, REF_DISTANCE / distance));
      result.push({
        id: entry.id,
        x: (pos.x * 0.5 + 0.5) * this.container.clientWidth,
        y: (-pos.y * 0.5 + 0.5) * this.container.clientHeight,
        scale,
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
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    disposeObject3D(this.scene);
    this.renderer.dispose();
  }
}

const PREVIEW_SLOT: BaySlot = { index: 0, position: new THREE.Vector3(0, 0, 0), rotationY: 0, cellSize: Infinity };

/** Fila+columna → código de casilla tipo "A4" (fila A arriba, columnas de izq. a der. desde 1). */
function cellCode(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

interface CellInfo { row: number; col: number; code: string; }

/** Qué modelo mostrar adentro de la casilla, según el tipo de estante. */
function categoryForTipo(tipo: EstanteTipo): ObjectCategory {
  const key = `${tipo.id} ${tipo.nombre}`.toLowerCase();
  if (key.includes('caja')) return 'caja';
  if (key.includes('tubo')) return 'tubo';
  return 'bulto';
}

/** Cada modelo .glb viene con su propia orientación/proporción "de fábrica" —
 * acá se corrige por categoría: rotationY para que quede bien parado/acostado,
 * y scale como fracción del ancho×alto de la casilla (no de la profundidad,
 * que suele ser la dimensión más chica y dejaba todo demasiado chico). */
interface CategoryPlacement { rotationY: number; scale: number; }
const CATEGORY_PLACEMENT: Record<ObjectCategory, CategoryPlacement> = {
  caja: { rotationY: 0, scale: 0.85 },
  bulto: { rotationY: 0, scale: 0.8 },
  tubo: { rotationY: Math.PI / 2, scale: 0.9 },
};

/** Escena chica y aislada: muestra un único estante en grande, para el constructor/editor de
 * tipos y para elegir una casilla puntual dentro de él. */
export class BayPreviewScene {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private orbitCam: SimpleOrbitCamera;
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private raf = 0;
  private bayGroup: THREE.Group | null = null;
  private resizeObserver: ResizeObserver;
  private dragging = false;
  private pointerDownOnCanvas = false;
  private movedDuringDrag = false;
  private lastX = 0;
  private lastY = 0;

  private currentTipo: EstanteTipo | null = null;
  private currentWidth = 0;
  private currentHeight = 0;
  private currentDepth = 0;
  private onSelectCell: ((cell: CellInfo) => void) | null = null;
  private selectedCell: CellInfo | null = null;
  private objectMesh: THREE.Object3D | null = null;
  private objectRequestSeq = 0;
  private objectBaseFit = 1;
  private objectBaseRotation = 0;
  private customObjectFile: File | null = null;

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDownOnCanvas = true;
    this.dragging = true;
    this.movedDuringDrag = false;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 6) this.movedDuringDrag = true;
    this.orbitCam.orbit(dx, dy);
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

  constructor(canvas: HTMLCanvasElement, container: HTMLElement, private onFrame?: () => void) {
    this.canvas = canvas;
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e7ebf0');

    this.orbitCam = new SimpleOrbitCamera(container.clientWidth / Math.max(1, container.clientHeight), 1, 25);
    this.orbitCam.target.set(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);

    this.scene.add(new THREE.AmbientLight('#ffffff', 0.7));
    const sun = new THREE.DirectionalLight('#fff6e6', 1);
    sun.position.set(4, 8, 6);
    sun.castShadow = true;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#dce6f5', 0.4);
    fill.position.set(-4, 3, -5);
    this.scene.add(fill);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.loop();
  }

  /** Rearma el estante con el tipo actual del formulario — se llama en cada cambio. */
  update(tipo: EstanteTipo) {
    if (this.bayGroup) {
      this.scene.remove(this.bayGroup);
      disposeObject3D(this.bayGroup);
    }
    this.clearSelection();
    const { width, height } = computeBayDims(tipo, PREVIEW_SLOT.cellSize);
    const { group, depth } = buildBay(PREVIEW_SLOT, width, height, tipo);
    this.bayGroup = group;
    this.scene.add(group);
    this.currentTipo = tipo;
    this.currentWidth = width;
    this.currentHeight = height;
    this.currentDepth = depth;

    // Para pallets "height" es la profundidad del piso, no una altura real —
    // mirar ahí arriba dejaría la cámara apuntando al aire sobre las tarimas.
    const targetY = tipo.montaje === 'piso' ? PALLET_HEIGHT : height / 2;
    this.orbitCam.target.set(0, targetY, 0);
    this.orbitCam.setRadius(Math.max(width, height) * 1.7);
  }

  /** Habilita (o desactiva, pasando null) elegir una casilla puntual con un click. */
  setSelectCellHandler(handler: ((cell: CellInfo) => void) | null) {
    this.onSelectCell = handler;
    if (!handler) this.clearSelection();
  }

  /** Si el ítem trae su propio .glb, se usa ese en vez del genérico por categoría. */
  setCustomObjectSource(file: File | null) {
    this.customObjectFile = file;
  }

  /** Ajusta a mano el objeto ya puesto — escala relativa a su tamaño de encaje y rotación extra en grados. */
  setObjectAdjustment(scaleMultiplier: number, extraRotationDeg: number) {
    if (!this.objectMesh) return;
    this.objectMesh.scale.setScalar(this.objectBaseFit * scaleMultiplier);
    this.objectMesh.rotation.y = this.objectBaseRotation + THREE.MathUtils.degToRad(extraRotationDeg);
  }

  private clearSelection() {
    this.selectedCell = null;
    this.objectRequestSeq++; // descarta cualquier carga de modelo en curso
    if (this.objectMesh) {
      this.bayGroup?.remove(this.objectMesh);
      disposeObject3D(this.objectMesh);
      this.objectMesh = null;
    }
  }

  /** Carga y ubica un modelo real adentro de la casilla elegida — el propio del
   * ítem si lo trae, o si no el genérico según el tipo de estante. */
  private async placeObjectInCell(cell: CellInfo) {
    if (!this.currentTipo || !this.bayGroup) return;
    const customFile = this.customObjectFile;
    const placement = customFile ? { rotationY: 0, scale: 0.8 } : CATEGORY_PLACEMENT[categoryForTipo(this.currentTipo)];
    const cellW = this.currentWidth / this.currentTipo.cols;
    const cellH = this.currentHeight / this.currentTipo.rows;
    const fitSize = Math.min(cellW, cellH) * placement.scale;
    const requestId = ++this.objectRequestSeq;

    const model = await (customFile ? loadObjectModelFromFile(customFile) : loadObjectModel(categoryForTipo(this.currentTipo))).catch(() => null);
    if (!model || requestId !== this.objectRequestSeq || !this.bayGroup) return; // la selección cambió mientras cargaba

    this.objectBaseFit = fitSize;
    this.objectBaseRotation = placement.rotationY;
    model.scale.setScalar(fitSize);
    model.rotation.y = placement.rotationY;
    // El rack industrial es una estructura abierta con el tablero cerca del
    // techo, no una cubículo cerrada con piso en cero — la fórmula genérica
    // (pensada para "cajas"/"tubos") lo mandaba al piso en vez de encima.
    const restY = this.currentTipo.id === 'rack' ? this.currentHeight : this.currentHeight - cellH * (cell.row + 1);
    model.position.set(-this.currentWidth / 2 + cellW * (cell.col + 0.5), restY, 0);
    if (this.objectMesh) {
      this.bayGroup.remove(this.objectMesh);
      disposeObject3D(this.objectMesh);
    }
    this.objectMesh = model;
    this.bayGroup.add(model);
  }

  private handleClick(e: PointerEvent) {
    if (!this.onSelectCell || !this.bayGroup || !this.currentTipo || this.currentTipo.montaje !== 'pared') return;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.orbitCam.camera);
    const hits = raycaster.intersectObject(this.bayGroup, true);
    if (hits.length === 0) return;

    // PREVIEW_SLOT no tiene posición/rotación, así que el punto del hit ya
    // está en el espacio local del estante.
    const point = hits[0].point;
    const { rows, cols } = this.currentTipo;
    const col = Math.min(cols - 1, Math.max(0, Math.floor((point.x + this.currentWidth / 2) / (this.currentWidth / cols))));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((this.currentHeight - point.y) / (this.currentHeight / rows))));

    const cell: CellInfo = { row, col, code: cellCode(row, col) };
    this.selectedCell = cell;
    this.placeObjectInCell(cell);
    this.onSelectCell(cell);
  }

  /** Posición en pantalla (px) de la casilla elegida, para la etiqueta flotante. */
  getSelectedCellScreenPos(): { x: number; y: number } | null {
    if (!this.selectedCell || !this.currentTipo) return null;
    const cellW = this.currentWidth / this.currentTipo.cols;
    const cellH = this.currentHeight / this.currentTipo.rows;
    const pos = new THREE.Vector3(
      -this.currentWidth / 2 + cellW * (this.selectedCell.col + 0.5),
      this.currentHeight - cellH * this.selectedCell.row,
      this.currentDepth / 2
    );
    pos.project(this.orbitCam.camera);
    if (pos.z > 1) return null;
    return {
      x: (pos.x * 0.5 + 0.5) * this.container.clientWidth,
      y: (-pos.y * 0.5 + 0.5) * this.container.clientHeight,
    };
  }

  private handleResize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.orbitCam.setAspect(w / h);
    this.renderer.setSize(w, h, false);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.orbitCam.update();
    this.renderer.render(this.scene, this.orbitCam.camera);
    this.onFrame?.();
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    disposeObject3D(this.scene);
    this.renderer.dispose();
  }
}
