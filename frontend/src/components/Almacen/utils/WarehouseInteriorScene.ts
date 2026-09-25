// src/components/Almacen/utils/WarehouseInteriorScene.ts
// Interior de un almacén: piso real de gridWidth×gridDepth cubos (1.3m cada
// uno, igual que el backend), sin paredes. Los racks son reales — un rack en
// pantalla es un rack real del backend, con la misma geometría siempre (no
// hay "tipos" visuales): esquinas alineadas a la grilla, profundidad 1 o 2
// cubos, ancho (bahías) libre, nivel tope según el estilo del almacén.
// Cámara orbital igual que "Ciudad": drag izquierdo orbita, drag derecho
// mueve la vista, rueda hace zoom.
import * as THREE from 'three';
import { SimpleOrbitCamera } from './CityScene';
import { CUBE_SIZE } from './warehouseMapping';
import { loadObjectModel, loadObjectModelFromArrayBuffer } from './objectModels';
import { productService } from '../../../services/almacen/product.service';
import { Bin } from '../../../types/almacen.types';

export interface GridPoint {
  gx: number;
  gz: number;
}

export interface WarehouseInteriorCallbacks {
  onSelectBay?: (id: string | null) => void;
  onFootprintReady?: (corner1: GridPoint, corner2: GridPoint) => void;
  onFrame?: () => void;
}

const LEVEL_HEIGHT = 0.85;
const RACK_BEAM_COLOR = '#f2660a';
const FLOOR_MARGIN = 1.5; // metros de piso decorativo alrededor de la grilla ubicable

function normalizeRect(c1: GridPoint, c2: GridPoint) {
  return {
    minX: Math.min(c1.gx, c2.gx),
    maxX: Math.max(c1.gx, c2.gx),
    minZ: Math.min(c1.gz, c2.gz),
    maxZ: Math.max(c1.gz, c2.gz),
  };
}
type Rect = ReturnType<typeof normalizeRect>;

/** Dos rectángulos necesitan al menos 1 cubo entero vacío entre sí — ni pegados, ni superpuestos. */
function rectsHaveClearance(a: Rect, b: Rect, buffer = 1): boolean {
  return a.maxX + buffer <= b.minX || b.maxX + buffer <= a.minX || a.maxZ + buffer <= b.minZ || b.maxZ + buffer <= a.minZ;
}

let concreteTextureCache: THREE.CanvasTexture | null = null;

function drawMarbleVein(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, width: number, alpha: number) {
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
}

/** Piso de mármol blanco tipo Carrara — vetas dibujadas sobre el lienzo entero y el grout recién después, encima. */
function getConcreteTexture(): THREE.CanvasTexture {
  if (concreteTextureCache) return concreteTextureCache;
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

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

  const flowAngle = -0.55;
  for (let i = 0; i < 18; i++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const angle = flowAngle + (Math.random() - 0.5) * 0.9;
    const len = size * (0.25 + Math.random() * 0.55);
    const x0 = cx - Math.cos(angle) * len * 0.5;
    const y0 = cy - Math.sin(angle) * len * 0.5;
    const x1 = cx + Math.cos(angle) * len * 0.5;
    const y1 = cy + Math.sin(angle) * len * 0.5;
    drawMarbleVein(ctx, x0, y0, x1, y1, 0.7 + Math.random() * 1.2, 0.08 + Math.random() * 0.12);
    const branches = Math.random() < 0.45 ? 1 : 0;
    for (let b = 0; b < branches; b++) {
      const t = 0.2 + Math.random() * 0.6;
      const bx = x0 + (x1 - x0) * t;
      const by = y0 + (y1 - y0) * t;
      const branchAngle = angle + (Math.random() - 0.5) * 1.4;
      const branchLen = len * (0.2 + Math.random() * 0.3);
      drawMarbleVein(ctx, bx, by, bx + Math.cos(branchAngle) * branchLen, by + Math.sin(branchAngle) * branchLen, 0.5 + Math.random(), 0.1 + Math.random() * 0.14);
    }
  }

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

/** Piso real: gridWidth×gridDepth cubos de 1.3m, con un margen decorativo alrededor y las líneas de la grilla marcadas. */
function buildRoom(scene: THREE.Scene, gridWidth: number, gridDepth: number) {
  const placeableW = gridWidth * CUBE_SIZE;
  const placeableD = gridDepth * CUBE_SIZE;

  const texture = getConcreteTexture().clone();
  texture.needsUpdate = true;
  const tileSpan = 6;
  const floorW = placeableW + FLOOR_MARGIN * 2;
  const floorD = placeableD + FLOOR_MARGIN * 2;
  texture.repeat.set(Math.max(1, floorW / tileSpan), Math.max(1, floorD / tileSpan));

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorW, floorD),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Líneas de la grilla ubicable — cada línea es un cubo real de 1.3m.
  const points: THREE.Vector3[] = [];
  const halfW = placeableW / 2;
  const halfD = placeableD / 2;
  for (let i = 0; i <= gridWidth; i++) {
    const x = -halfW + i * CUBE_SIZE;
    points.push(new THREE.Vector3(x, 0.005, -halfD), new THREE.Vector3(x, 0.005, halfD));
  }
  for (let i = 0; i <= gridDepth; i++) {
    const z = -halfD + i * CUBE_SIZE;
    points.push(new THREE.Vector3(-halfW, 0.005, z), new THREE.Vector3(halfW, 0.005, z));
  }
  const gridGeom = new THREE.BufferGeometry().setFromPoints(points);
  const gridLines = new THREE.LineSegments(gridGeom, new THREE.LineBasicMaterial({ color: '#b9c3cc', transparent: true, opacity: 0.5 }));
  scene.add(gridLines);

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

function setGroupOpacity(group: THREE.Group, opacity: number) {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as any).isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m: any) => {
      m.transparent = opacity < 1;
      m.opacity = opacity;
    });
  });
}

/** Marca cuál de las dos caras (a lo largo del eje "profundidad") es la accesible — una franja verde al piso de esa cara. */
function addDirectionMarker(group: THREE.Group, direction: 0 | 1, worldWidth: number, worldDepth: number) {
  const z = direction === 0 ? worldDepth / 2 : -worldDepth / 2;
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(worldWidth * 0.9, 0.03, 0.05),
    new THREE.MeshStandardMaterial({ color: '#22c55e', emissive: '#22c55e', emissiveIntensity: 0.5 })
  );
  marker.position.set(0, 0.04, z);
  group.add(marker);
}

// Estantes por defecto de un almacén nuevo (ver CiudadModal.tsx, createDefaultRacks) — el nombre
// exacto de la disciplina dispara el bloque de cabecera; cualquier otro nombre usa el cartel simple
// de siempre. No hay columna de "categoría" en el backend: el nombre ES el dato, a propósito, para
// no agregar un concepto nuevo por un cartel. Un color distinto por categoría, pero apagado/oscuro
// (no primario vivo) — letra blanca en las 3.
const CATEGORY_NAMEPLATE_STYLES: Record<string, { bg: string; fg: string }> = {
  'arquitectura': { bg: '#166534', fg: '#ffffff' },
  'estructura': { bg: '#991b1b', fg: '#ffffff' },
  'mecánica': { bg: '#1e3a8a', fg: '#ffffff' },
};

/** Cartel con el nombre — se puede reemplazar en caliente al renombrar. Un estante de disciplina
 * (ver arriba) es un BLOQUE sólido apoyado justo encima de la viga del nivel más alto, tocándola
 * (parte de la estructura, no un cartel flotando adelante); cualquier otro nombre usa el cartel
 * simple de siempre, la placa plana transparente sobre la viga. */
function buildNameplate(name: string, plateWidth: number, plateHeight: number, plateDepth: number): THREE.Mesh {
  const categoryStyle = CATEGORY_NAMEPLATE_STYLES[name.trim().toLowerCase()] ?? null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = Math.max(1, Math.round(1024 * (plateHeight / plateWidth)));
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (categoryStyle) {
    ctx.fillStyle = categoryStyle.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = categoryStyle ? categoryStyle.fg : '#2a1400';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let fontSize = canvas.height * (categoryStyle ? 0.68 : 0.6);
  ctx.font = `bold ${fontSize}px sans-serif`;
  while (ctx.measureText(name).width > canvas.width * 0.88 && fontSize > 10) {
    fontSize -= 4;
    ctx.font = `bold ${fontSize}px sans-serif`;
  }
  ctx.fillText(name, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  if (categoryStyle) {
    // Caras del costado/arriba/abajo/atrás lisas del mismo color — solo la de adelante lleva el
    // texto. Orden de THREE.BoxGeometry: [+x, -x, +y, -y, +z, -z]; el frente del rack es +z.
    const sideMat = new THREE.MeshStandardMaterial({ color: categoryStyle.bg, roughness: 0.45 });
    const frontMat = new THREE.MeshBasicMaterial({ map: texture });
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(plateWidth, plateHeight, plateDepth),
      [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat]
    );
    mesh.castShadow = true;
    mesh.name = 'nameplate';
    return mesh;
  }

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(plateWidth, plateHeight),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true })
  );
  mesh.name = 'nameplate';
  return mesh;
}

// Profundidad visual (adelante-atrás) de un estante respecto de su celda de grilla — solo dibujo,
// la grilla y lo guardado siguen usando la celda entera.
const RACK_DEPTH_FACTOR = 0.6;
const PALLET_DEPTH_FACTOR = 0.75;
const PALLET_HEIGHT = 0.16;

/** Una "Tarima" es un estante de 1 nivel que se dibuja como tarima de madera en el piso. No hay
 * columna de tipo en el backend: el nombre ES el dato (mismo criterio que los carteles de categoría). */
export function isPalletName(name: string): boolean {
  return name.trim().toLowerCase().startsWith('tarima');
}

interface RackMesh { group: THREE.Group; labelAnchor: THREE.Object3D; worldWidth: number; worldDepth: number; height: number; baseY: number }

/** Tarima de madera: listones arriba y tres travesaños abajo. Se dibuja con la cara superior en el
 * mismo plano que un nivel 1 de estante (LEVEL_HEIGHT) y baseY baja todo el grupo para que apoye en el
 * piso — así las casillas y los objetos se posicionan igual que en cualquier estante. */
function buildPalletMesh(widthCubes: number, depthCubes: number): RackMesh {
  const group = new THREE.Group();
  const worldWidth = widthCubes * CUBE_SIZE;
  const worldDepth = depthCubes * CUBE_SIZE * PALLET_DEPTH_FACTOR;
  const wood = new THREE.MeshStandardMaterial({ color: '#d9b982', roughness: 0.85 });
  const topY = LEVEL_HEIGHT;
  const boardT = 0.025;
  const stringerH = PALLET_HEIGHT - boardT;

  const boards = 7;
  const pitch = worldDepth / boards;
  for (let i = 0; i < boards; i++) {
    const board = new THREE.Mesh(new THREE.BoxGeometry(worldWidth, boardT, pitch * 0.72), wood);
    board.position.set(0, topY - boardT / 2, -worldDepth / 2 + pitch * (i + 0.5));
    board.castShadow = true;
    board.receiveShadow = true;
    group.add(board);
  }
  const stringerW = 0.12;
  [-1, 0, 1].forEach((k) => {
    const x = k === 0 ? 0 : k * (worldWidth / 2 - stringerW / 2);
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(stringerW, stringerH, worldDepth * 0.94), wood);
    stringer.position.set(x, topY - boardT - stringerH / 2, 0);
    stringer.castShadow = true;
    group.add(stringer);
  });

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(0, topY + 0.3, 0);
  group.add(labelAnchor);
  return { group, labelAnchor, worldWidth, worldDepth, height: LEVEL_HEIGHT, baseY: -(LEVEL_HEIGHT - PALLET_HEIGHT) };
}

/** Rack real: parantes (uno por límite de bahía, con arriostre diagonal en las 4 esquinas), vigas y tablero por nivel. */
function buildRackMesh(widthCubes: number, depthCubes: number, levels: number, isPallet = false): RackMesh {
  if (isPallet) return buildPalletMesh(widthCubes, depthCubes);
  const group = new THREE.Group();
  // El ancho llena la celda entera, calza con las líneas de la grilla del piso. La profundidad
  // (distancia entre la viga de adelante y la de atrás) se angosta a propósito — se veía como un
  // tablón demasiado hondo para lo que en general se guarda ahí.
  const worldWidth = widthCubes * CUBE_SIZE;
  const worldDepth = depthCubes * CUBE_SIZE * RACK_DEPTH_FACTOR;
  const height = levels * LEVEL_HEIGHT;
  const postSize = 0.06;
  const beamThickness = 0.07;
  const deckThickness = 0.028;
  const halfW = worldWidth / 2;
  const halfD = worldDepth / 2;

  const postMat = new THREE.MeshStandardMaterial({ color: '#1560e0', roughness: 0.3, metalness: 0.45 });
  const innerPostMat = new THREE.MeshStandardMaterial({ color: '#1560e0', roughness: 0.4, metalness: 0.35 });
  const beamMat = new THREE.MeshStandardMaterial({ color: RACK_BEAM_COLOR, roughness: 0.3, metalness: 0.3 });
  const deckMat = new THREE.MeshStandardMaterial({ color: '#ece7d8', roughness: 0.85 });
  const feetMat = new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.8 });

  const frontZ = halfD - postSize / 2;
  const backZ = -(halfD - postSize / 2);
  const braceThickness = 0.028;
  const braceSegments = 4;

  // Un poste cada 2 bahías (no en cada límite) — las dos puntas siempre
  // llevan poste, aunque el ancho sea impar y la última pareja quede corta.
  const postIndices: number[] = [];
  for (let i = 0; i <= widthCubes; i += 2) postIndices.push(i);
  if (postIndices[postIndices.length - 1] !== widthCubes) postIndices.push(widthCubes);

  for (const i of postIndices) {
    const x = -halfW + (i / widthCubes) * worldWidth;
    const isCorner = i === 0 || i === widthCubes;
    [frontZ, backZ].forEach((z) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(postSize, height, postSize), isCorner ? postMat : innerPostMat);
      post.position.set(x, height / 2, z);
      post.castShadow = true;
      post.receiveShadow = true;
      group.add(post);

      const foot = new THREE.Mesh(new THREE.CylinderGeometry(postSize * 0.75, postSize * 0.75, 0.03, 10), feetMat);
      foot.position.set(x, 0.015, z);
      group.add(foot);
    });

    if (isCorner) {
      const segH = height / braceSegments;
      for (let s = 0; s < braceSegments; s++) {
        const z0 = s % 2 === 0 ? frontZ : backZ;
        const z1 = s % 2 === 0 ? backZ : frontZ;
        const y0 = segH * s;
        const y1 = segH * (s + 1);
        const dz = z1 - z0;
        const dy = y1 - y0;
        const length = Math.hypot(dz, dy);
        const brace = new THREE.Mesh(new THREE.BoxGeometry(braceThickness, length, braceThickness), postMat);
        brace.rotation.x = Math.atan2(dz, dy);
        brace.position.set(x, (y0 + y1) / 2, (z0 + z1) / 2);
        brace.castShadow = true;
        group.add(brace);
      }
    }
  }

  for (let r = 1; r <= levels; r++) {
    const y = LEVEL_HEIGHT * r - beamThickness / 2;
    [-1, 1].forEach((sz) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(worldWidth, beamThickness, postSize * 1.3), beamMat);
      beam.position.set(0, y, sz * (halfD - postSize / 2));
      beam.castShadow = true;
      beam.receiveShadow = true;
      group.add(beam);
    });

    const deck = new THREE.Mesh(new THREE.BoxGeometry(worldWidth - postSize * 0.6, deckThickness, worldDepth - postSize * 1.2), deckMat);
    deck.position.set(0, y + beamThickness / 2 + deckThickness / 2, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    // Líneas guía de bahía sobre el tablero — marcan dónde arranca cada casilla real, no dividen de verdad.
    for (let i = 1; i < widthCubes; i++) {
      const x = -halfW + (i / widthCubes) * worldWidth;
      const geom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, y + beamThickness / 2 + deckThickness + 0.002, -halfD + postSize),
        new THREE.Vector3(x, y + beamThickness / 2 + deckThickness + 0.002, halfD - postSize),
      ]);
      group.add(new THREE.Line(geom, new THREE.LineBasicMaterial({ color: '#c9a96a' })));
    }
  }

  const labelAnchor = new THREE.Object3D();
  labelAnchor.position.set(0, height + 0.3, 0);
  group.add(labelAnchor);

  return { group, labelAnchor, worldWidth, worldDepth, height, baseY: 0 };
}

interface BayEntry {
  id: string;
  isPallet: boolean;
  corner1: GridPoint;
  corner2: GridPoint;
  levels: number;
  direction: 0 | 1;
  group: THREE.Group;
  labelAnchor: THREE.Object3D;
  worldWidth: number;
  worldDepth: number;
  height: number;
}

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
  // Objetos de stock puestos en la vista general (todos los racks juntos, sin entrar a ninguno) —
  // bay id -> bin_id -> el modelo que se dibujó ahí. Separado por bay para poder limpiar/reponer
  // el stock de un solo rack sin tocar los demás.
  private stockObjectsByBay = new Map<string, Map<number, THREE.Object3D>>();
  private disposed = false;
  private resizeObserver: ResizeObserver;
  private callbacks: WarehouseInteriorCallbacks;
  private gridWidth: number;
  private gridDepth: number;

  private pointerDownOnCanvas = false;
  private dragButton = 0;
  private dragging = false;
  private movedDuringDrag = false;
  private lastX = 0;
  private lastY = 0;
  private lastPointer = { x: 0, y: 0 };

  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private placingActive = false;
  private placeAnchor: GridPoint | null = null;
  private footprintIndicator: THREE.Group | null = null;
  private draftFootprint: { corner1: GridPoint; corner2: GridPoint } | null = null;
  private draftGroup: THREE.Group | null = null;
  private draftLabelAnchor: THREE.Object3D | null = null;
  private draftLevels = 1;
  private draftIsPallet = false;
  private draftDirection: 0 | 1 = 0;
  private draftWorldWidth = 0;
  private draftWorldDepth = 0;
  private draftHeight = 0;

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
    if (this.placingActive && !this.draftFootprint) this.updateDrawingIndicator(e);
    if (!this.dragging) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    if (Math.abs(dx) + Math.abs(dy) > 6) this.movedDuringDrag = true;
    if (this.dragButton === 2) this.orbitCam.pan(dx, dy);
    else this.orbitCam.orbit(dx, dy);
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

  constructor(canvas: HTMLCanvasElement, container: HTMLElement, gridWidth: number, gridDepth: number, callbacks: WarehouseInteriorCallbacks = {}) {
    this.canvas = canvas;
    this.container = container;
    this.callbacks = callbacks;
    this.gridWidth = gridWidth;
    this.gridDepth = gridDepth;

    const roomSpan = Math.max(gridWidth, gridDepth) * CUBE_SIZE;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e7ebf0');

    this.orbitCam = new SimpleOrbitCamera(container.clientWidth / Math.max(1, container.clientHeight), 2, roomSpan * 1.6);
    this.orbitCam.target.set(0, 1.2, 0);
    this.orbitCam.setRadius(roomSpan * 0.9);

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
    const fill = new THREE.DirectionalLight('#dce6f5', 0.5);
    fill.position.set(-6, 5, -8);
    this.scene.add(fill);

    buildRoom(this.scene, gridWidth, gridDepth);
    this.scene.add(this.baysGroup);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.loop();
  }

  private gridToWorldX(gx: number) {
    return (gx - this.gridWidth / 2) * CUBE_SIZE;
  }
  private gridToWorldZ(gz: number) {
    return (gz - this.gridDepth / 2) * CUBE_SIZE;
  }
  private worldToGridX(x: number) {
    return x / CUBE_SIZE + this.gridWidth / 2;
  }
  private worldToGridZ(z: number) {
    return z / CUBE_SIZE + this.gridDepth / 2;
  }

  private pointToGrid(point: THREE.Vector3): GridPoint {
    const gx = Math.round(this.worldToGridX(point.x));
    const gz = Math.round(this.worldToGridZ(point.z));
    return { gx: Math.min(this.gridWidth, Math.max(0, gx)), gz: Math.min(this.gridDepth, Math.max(0, gz)) };
  }

  private raycastGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.orbitCam.camera);
    const point = new THREE.Vector3();
    return raycaster.ray.intersectPlane(this.groundPlane, point) ? point : null;
  }

  /** Corners alineados a la grilla + dentro del grid + separado ≥1 cubo de cualquier otro rack.
   * El backend NO reordena por cuál lado es más corto: X es SIEMPRE el ancho (bahías, libre) y Z
   * es SIEMPRE la profundidad (debe dar 1 o 2, nunca más) — acá se valida con ese mismo eje fijo. */
  private isFootprintValid(c1: GridPoint, c2: GridPoint): boolean {
    const r = normalizeRect(c1, c2);
    const width = r.maxX - r.minX;
    const depth = r.maxZ - r.minZ;
    // Ancho (bahías) par y de al menos 2 — cada poste intermedio va cada 2 bahías, un ancho impar dejaría uno pisando el medio de la última.
    if (width < 2 || width % 2 !== 0 || depth < 1 || depth > 2) return false;
    if (r.minX < 0 || r.minZ < 0 || r.maxX > this.gridWidth || r.maxZ > this.gridDepth) return false;
    for (const entry of this.bays.values()) {
      if (!rectsHaveClearance(r, normalizeRect(entry.corner1, entry.corner2))) return false;
    }
    return true;
  }

  getBayIds(): string[] {
    return Array.from(this.bays.keys());
  }

  getBay(id: string): { corner1: GridPoint; corner2: GridPoint; levels: number; direction: 0 | 1 } | null {
    const entry = this.bays.get(id);
    if (!entry) return null;
    return { corner1: entry.corner1, corner2: entry.corner2, levels: entry.levels, direction: entry.direction };
  }

  /** Levanta un rack ya existente (viene del backend) en su posición real. */
  loadBay(id: string, corner1: GridPoint, corner2: GridPoint, levels: number, direction: 0 | 1, name: string) {
    const r = normalizeRect(corner1, corner2);
    // Eje fijo, igual que el backend: X siempre ancho (bahías), Z siempre profundidad — nunca se reordena ni se rota.
    const widthCubes = r.maxX - r.minX;
    const depthCubes = r.maxZ - r.minZ;
    const isPallet = isPalletName(name);
    const { group, labelAnchor, worldWidth, worldDepth, height, baseY } = buildRackMesh(widthCubes, depthCubes, isPallet ? 1 : levels, isPallet);
    group.position.set(this.gridToWorldX((r.minX + r.maxX) / 2), baseY, this.gridToWorldZ((r.minZ + r.maxZ) / 2));
    if (!isPallet) addDirectionMarker(group, direction, worldWidth, worldDepth);
    group.userData.bayId = id;
    this.baysGroup.add(group);
    this.bays.set(id, { id, isPallet, corner1, corner2, levels, direction, group, labelAnchor, worldWidth, worldDepth, height });
    this.setBayName(id, name);
  }

  /** Graba (o reemplaza) el nombre en la viga naranja del nivel más alto — se llama de nuevo cada vez que se renombra. */
  setBayName(id: string, name: string) {
    const entry = this.bays.get(id);
    if (!entry) return;
    const old = entry.group.getObjectByName('nameplate');
    if (old) {
      entry.group.remove(old);
      disposeObject3D(old);
    }
    if (isPalletName(name)) return; // la tarima no lleva cartel: es baja y va en grupo bajo su cabecera
    const isCategory = CATEGORY_NAMEPLATE_STYLES[name.trim().toLowerCase()] != null;
    const plateWidth = isCategory ? Math.min(entry.worldWidth * 0.95, 3.2) : Math.min(entry.worldWidth * 0.85, 2.4);
    const plateHeight = isCategory ? plateWidth / 4.5 : plateWidth / 4;
    const plateDepth = isCategory ? 0.2 : 0.12;
    const plate = buildNameplate(name, plateWidth, plateHeight, plateDepth);
    if (isCategory) {
      // Apoyado justo encima de la viga del último nivel, tocándola — parte del estante, no un
      // cartel flotando adelante con hueco de por medio.
      plate.position.set(0, entry.height + plateHeight / 2, entry.worldDepth / 2 - plateDepth / 2);
    } else {
      plate.position.set(0, entry.height - plateHeight / 2 - 0.08, entry.worldDepth / 2 + 0.005);
    }
    entry.group.add(plate);
  }

  remapBayId(oldId: string, newId: string) {
    const entry = this.bays.get(oldId);
    if (!entry) return;
    entry.id = newId;
    entry.group.userData.bayId = newId;
    this.bays.delete(oldId);
    this.bays.set(newId, entry);
    const stock = this.stockObjectsByBay.get(oldId);
    if (stock) {
      this.stockObjectsByBay.delete(oldId);
      this.stockObjectsByBay.set(newId, stock);
    }
  }

  removeBay(id: string) {
    const entry = this.bays.get(id);
    if (!entry) return;
    this.baysGroup.remove(entry.group);
    disposeObject3D(entry.group); // ya libera los modelos de stock: son hijos de entry.group
    this.bays.delete(id);
    this.stockObjectsByBay.delete(id);
  }

  /** Pone en su casilla real cada objeto ya guardado en este rack — el modelo propio del producto si lo
   * tiene, o el genérico si no. Se llama al cargar el almacén, para verlo de un vistazo sin tener que
   * entrar a cada estante (mismo criterio visual que BayPreviewScene.renderStock, pero para todos a la vez). */
  async renderBayStock(bayId: string, bins: Bin[]) {
    const entry = this.bays.get(bayId);
    if (!entry) return;

    const previous = this.stockObjectsByBay.get(bayId);
    if (previous) {
      for (const obj of previous.values()) {
        entry.group.remove(obj);
        disposeObject3D(obj);
      }
    }
    const current = new Map<number, THREE.Object3D>();
    this.stockObjectsByBay.set(bayId, current);

    const rect = normalizeRect(entry.corner1, entry.corner2);
    const depthCubes = rect.maxZ - rect.minZ;
    const bayCount = Math.max(1, Math.round(entry.worldWidth / CUBE_SIZE));
    const cellW = entry.worldWidth / bayCount;
    const rowDepth = entry.worldDepth / depthCubes;

    for (const bin of bins) {
      const content = bin.contents?.[0];
      if (!content) continue;

      let model: THREE.Object3D | null = null;
      if (content.model_3d_url) model = await loadProductModel(content.model_3d_url).catch(() => null);
      if (!model) model = await loadObjectModel('bulto').catch(() => null);
      if (!model) continue;
      // El estante se pudo haber quitado (o recargado, ver el `current` de arriba) mientras esto cargaba.
      if (this.disposed || this.stockObjectsByBay.get(bayId) !== current || !this.bays.has(bayId)) {
        disposeObject3D(model);
        continue;
      }

      model.scale.setScalar(fitScaleForCell(model, cellW, rowDepth, LEVEL_HEIGHT));
      model.rotation.y = GENERIC_OBJECT_FIT.rotationY;
      const x = -entry.worldWidth / 2 + cellW * (bin.bay + 0.5);
      const y = LEVEL_HEIGHT * bin.level;
      const z = depthCubes === 1 ? 0 : (bin.face === 0 ? rowDepth / 2 : -rowDepth / 2);
      model.position.set(x, y, z);
      entry.group.add(model);
      current.set(bin.bin_id, model);
    }
  }

  /** Arranca el modo "dibujar rack nuevo": primer click fija una esquina, el segundo la opuesta. */
  startPlacingBay(isPallet = false) {
    this.cancelPlacingBay();
    this.draftIsPallet = isPallet;
    this.placingActive = true;
  }

  cancelPlacingBay() {
    this.placingActive = false;
    this.placeAnchor = null;
    if (this.footprintIndicator) {
      this.scene.remove(this.footprintIndicator);
      disposeObject3D(this.footprintIndicator);
      this.footprintIndicator = null;
    }
    if (this.draftGroup) {
      this.scene.remove(this.draftGroup);
      disposeObject3D(this.draftGroup);
      this.draftGroup = null;
      this.draftLabelAnchor = null;
    }
    this.draftFootprint = null;
  }

  private updateDrawingIndicator(e?: PointerEvent) {
    const point = this.raycastGround(e?.clientX ?? this.lastPointer.x, e?.clientY ?? this.lastPointer.y);
    if (!point) return;
    const hovered = this.pointToGrid(point);
    const c1 = this.placeAnchor ?? hovered;
    const valid = this.placeAnchor ? this.isFootprintValid(c1, hovered) : true;
    this.renderFootprintIndicator(c1, hovered, valid);
  }

  private renderFootprintIndicator(c1: GridPoint, c2: GridPoint, valid: boolean) {
    if (this.footprintIndicator) {
      this.scene.remove(this.footprintIndicator);
      disposeObject3D(this.footprintIndicator);
    }
    const r = normalizeRect(c1, c2);
    const w = Math.max(0.08, (r.maxX - r.minX || 1) * CUBE_SIZE);
    const d = Math.max(0.08, (r.maxZ - r.minZ || 1) * CUBE_SIZE);
    const cx = this.gridToWorldX((r.minX + (r.maxX || r.minX + 1)) / 2);
    const cz = this.gridToWorldZ((r.minZ + (r.maxZ || r.minZ + 1)) / 2);
    const color = valid ? '#22c55e' : '#ef4444';
    const group = new THREE.Group();
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(cx, 0.03, cz);
    group.add(plane);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, d)), new THREE.LineBasicMaterial({ color }));
    outline.rotation.x = -Math.PI / 2;
    outline.position.set(cx, 0.035, cz);
    group.add(outline);
    this.footprintIndicator = group;
    this.scene.add(group);
  }

  private rebuildDraft() {
    if (!this.draftFootprint) return;
    if (this.draftGroup) {
      this.scene.remove(this.draftGroup);
      disposeObject3D(this.draftGroup);
    }
    const { corner1, corner2 } = this.draftFootprint;
    const r = normalizeRect(corner1, corner2);
    // Eje fijo, igual que el backend: X siempre ancho (bahías), Z siempre profundidad — nunca se reordena ni se rota.
    const widthCubes = r.maxX - r.minX;
    const depthCubes = r.maxZ - r.minZ;
    const { group, labelAnchor, worldWidth, worldDepth, height, baseY } = buildRackMesh(widthCubes, depthCubes, this.draftIsPallet ? 1 : this.draftLevels, this.draftIsPallet);
    group.position.set(this.gridToWorldX((r.minX + r.maxX) / 2), baseY, this.gridToWorldZ((r.minZ + r.maxZ) / 2));
    if (!this.draftIsPallet) addDirectionMarker(group, this.draftDirection, worldWidth, worldDepth);
    setGroupOpacity(group, 0.6);
    this.scene.add(group);
    this.draftGroup = group;
    this.draftLabelAnchor = labelAnchor;
    this.draftWorldWidth = worldWidth;
    this.draftWorldDepth = worldDepth;
    this.draftHeight = height;
  }

  /** Niveles/dirección elegidos en el panel — reconstruye la vista previa en vivo (no toca el footprint). */
  updateDraftLevels(levels: number) {
    this.draftLevels = Math.max(1, levels);
    this.rebuildDraft();
  }

  updateDraftDirection(direction: 0 | 1) {
    this.draftDirection = direction;
    this.rebuildDraft();
  }

  /** Tipo elegido en el panel: tarima (1 nivel, en el piso) o estante común. */
  updateDraftType(isPallet: boolean) {
    this.draftIsPallet = isPallet;
    this.rebuildDraft();
  }

  /** Confirma el draft actual — lo vuelve un rack real (local) y devuelve sus datos para guardarlo contra el backend. */
  confirmDraft(name: string): { id: string; corner1: GridPoint; corner2: GridPoint; levels: number; direction: 0 | 1 } | null {
    if (!this.draftFootprint || !this.draftGroup || !this.draftLabelAnchor) return null;
    const id = `r${this.bayCounter++}`;
    setGroupOpacity(this.draftGroup, 1);
    this.draftGroup.userData.bayId = id;
    this.scene.remove(this.draftGroup);
    this.baysGroup.add(this.draftGroup);
    const entry: BayEntry = {
      id,
      isPallet: this.draftIsPallet,
      corner1: this.draftFootprint.corner1,
      corner2: this.draftFootprint.corner2,
      levels: this.draftIsPallet ? 1 : this.draftLevels,
      direction: this.draftDirection,
      group: this.draftGroup,
      labelAnchor: this.draftLabelAnchor,
      worldWidth: this.draftWorldWidth,
      worldDepth: this.draftWorldDepth,
      height: this.draftHeight,
    };
    this.bays.set(id, entry);
    this.setBayName(id, name);
    const result = { id, corner1: entry.corner1, corner2: entry.corner2, levels: entry.levels, direction: entry.direction };
    this.draftGroup = null;
    this.draftLabelAnchor = null;
    this.draftFootprint = null;
    this.placingActive = false;
    return result;
  }

  focusBay(id: string) {
    const entry = this.bays.get(id);
    if (!entry) return;
    const pos = entry.group.position.clone();
    pos.y = (entry.levels * LEVEL_HEIGHT) * 0.5;
    this.orbitCam.flyTo(pos, Math.max(3.5, entry.levels * LEVEL_HEIGHT * 1.8));
  }

  private handleClick(e: PointerEvent) {
    if (this.placingActive) {
      if (this.draftFootprint) return; // esperando confirmación de niveles/dirección en el panel
      const point = this.raycastGround(e.clientX, e.clientY);
      if (!point) return;
      const hovered = this.pointToGrid(point);
      if (!this.placeAnchor) {
        this.placeAnchor = hovered;
        return;
      }
      const c1 = this.placeAnchor;
      if (this.isFootprintValid(c1, hovered)) {
        this.draftFootprint = { corner1: c1, corner2: hovered };
        this.placeAnchor = null;
        if (this.footprintIndicator) {
          this.scene.remove(this.footprintIndicator);
          disposeObject3D(this.footprintIndicator);
          this.footprintIndicator = null;
        }
        this.rebuildDraft();
        this.callbacks.onFootprintReady?.(c1, hovered);
      } else {
        this.placeAnchor = hovered; // más permisivo que quedar trabado en una selección inválida
      }
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
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
    this.disposed = true;
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

/** Rotación de encaje del modelo puesto en una casilla (genérico o el propio del producto) — el
 * tamaño lo resuelve fitScaleForCell, por modelo, según su bounding box real. */
const GENERIC_OBJECT_FIT = { rotationY: 0 };

// Escala uniforme que hace que el modelo YA CARGADO ocupe lo más posible del hueco real de la
// casilla (ancho de bahía × profundidad de fila × alto de nivel) sin salirse de ninguno de los
// tres. Reemplaza escalar solo por la dimensión más grande del modelo normalizado (loadObjectModel/
// loadProductModel dejan esa dimensión en 1): un modelo más ancho que alto quedaba con la altura
// real muy por debajo del nivel disponible y se veía chico contra la estantería, aunque su ancho
// estuviera bien — hallado al ver un modelo subido (una casilla) y hasta el genérico "bulto".
function fitScaleForCell(model: THREE.Object3D, cellW: number, rowDepth: number, levelHeight: number): number {
  const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
  const byWidth = size.x > 1e-6 ? (cellW * 0.92) / size.x : Infinity;
  const byDepth = size.z > 1e-6 ? (rowDepth * 0.92) / size.z : Infinity;
  const byHeight = size.y > 1e-6 ? (levelHeight * 0.95) / size.y : Infinity;
  return Math.min(byWidth, byDepth, byHeight);
}

const productModelCache = new Map<string, Promise<THREE.Object3D>>();

/** Modelo real de un producto (asignado desde su biblioteca de modelos 3D) — solo sabe abrir URLs
 * con la convención de model_3d_url (/projects/:id/model-3d-assets/:id/content); cualquier otra
 * cosa la rechaza, para que el que llama caiga al genérico. */
function loadProductModel(url: string): Promise<THREE.Object3D> {
  let promise = productModelCache.get(url);
  if (!promise) {
    const match = url.match(/\/projects\/(\d+)\/model-3d-assets\/(\d+)\/content/);
    if (!match) return Promise.reject(new Error('Ruta de modelo no reconocida'));
    promise = productService.getModel3DAssetContentArrayBuffer(Number(match[1]), Number(match[2])).then((buffer) => loadObjectModelFromArrayBuffer(buffer));
    productModelCache.set(url, promise);
  }
  return promise.then((base) => base.clone(true));
}

/** Escena chica y aislada: un único rack en grande, para elegir una casilla (bin) real puntual dentro de él. */
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

  private currentWidth = 0;
  private currentDepth = 0;
  private currentDepthCubes = 1;
  private currentLevels = 0;
  private bins: Bin[] = [];
  private currentFace: 0 | 1 = 0;
  private onSelectCell: ((bin: Bin) => void) | null = null;
  // Modo solo-vista (sin pickMode): clickear una casilla la selecciona para mostrar su contenido, sin
  // poner ningún modelo nuevo encima — a diferencia de onSelectCell, que es "elegir dónde guardar un ítem".
  private onSelectExisting: ((bin: Bin) => void) | null = null;
  private selectedBin: Bin | null = null;
  private hoveredBin: Bin | null = null;
  private hoverMarker: THREE.Object3D | null = null;
  // Contorno dorado sobre el elemento (el objeto real ya puesto en la casilla) que se acaba de
  // seleccionar en modo solo-vista — a diferencia de hoverMarker, queda fijo hasta la próxima selección.
  private selectedElementMarker: THREE.BoxHelper | null = null;
  private objectMesh: THREE.Object3D | null = null;
  private objectRequestSeq = 0;
  private objectBaseFit = 1;
  private objectBaseRotation = 0;
  private productModelPath: string | null = null;
  private stockObjects = new Map<number, THREE.Object3D>();
  private stockRequestSeq = 0;

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDownOnCanvas = true;
    this.dragging = true;
    this.movedDuringDrag = false;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) this.updateBinHover(e);
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
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.orbitCam.zoomToward(e.deltaY, ndc);
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

    this.scene.add(new THREE.AmbientLight('#ffffff', 0.9));
    const sun = new THREE.DirectionalLight('#fff6e6', 1.3);
    sun.position.set(4, 8, 6);
    sun.castShadow = true;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight('#dce6f5', 0.5);
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

  /** Rearma el rack mostrado — se llama al entrar a un estante puntual, con sus dimensiones reales. */
  update(width: number, depth: number, levels: number, isPallet = false) {
    if (this.bayGroup) {
      this.scene.remove(this.bayGroup);
      disposeObject3D(this.bayGroup);
    }
    this.clearSelection();
    this.stockObjects = new Map(); // ya se disponen solos al disponer el bayGroup viejo, arriba
    const levelsShown = isPallet ? 1 : levels;
    const { group, height, worldDepth, baseY } = buildRackMesh(width, depth, levelsShown, isPallet);
    group.position.y = baseY;
    this.bayGroup = group;
    this.scene.add(group);
    this.currentWidth = width * CUBE_SIZE;
    // La profundidad visual (más angosta que la celda), no la de la grilla: de ahí salen las posiciones de las casillas.
    this.currentDepth = worldDepth;
    this.currentDepthCubes = depth;
    this.currentLevels = levelsShown;

    this.orbitCam.target.set(0, height / 2 + baseY, 0);
    this.orbitCam.setRadius(Math.max(this.currentWidth, height) * 1.7);
  }

  /** Casillas (bins) reales de este rack — bay 0-indexado, level 1-indexado, face 0/1. */
  setBins(bins: Bin[], face: 0 | 1 = 0) {
    this.bins = bins;
    this.currentFace = face;
    this.clearSelection();
  }

  setFace(face: 0 | 1) {
    this.currentFace = face;
    this.clearSelection();
  }

  hasFace(face: 0 | 1): boolean {
    return this.bins.some((b) => b.face === face);
  }

  /** Pone en su casilla real cada objeto que ya está guardado — el modelo propio del producto si lo tiene, o el
   * genérico si no. Se llama cada vez que se entra a mirar un estante, tenga o no algo guardado. */
  async renderStock(bins: Bin[]) {
    const requestId = ++this.stockRequestSeq;
    const targetGroup = this.bayGroup;
    for (const obj of this.stockObjects.values()) {
      targetGroup?.remove(obj);
      disposeObject3D(obj);
    }
    this.stockObjects.clear();
    if (!targetGroup) return;

    const bayCount = Math.max(1, Math.round(this.currentWidth / CUBE_SIZE));
    const cellW = this.currentWidth / bayCount;
    const rowDepth = this.currentDepth / this.currentDepthCubes;

    for (const bin of bins) {
      const content = bin.contents?.[0];
      if (!content) continue;

      let model: THREE.Object3D | null = null;
      if (content.model_3d_url) model = await loadProductModel(content.model_3d_url).catch(() => null);
      if (!model) model = await loadObjectModel('bulto').catch(() => null);
      // La selección puede haber cambiado (o el estante recargado) mientras esto cargaba.
      if (!model) continue;
      if (requestId !== this.stockRequestSeq || this.bayGroup !== targetGroup) {
        disposeObject3D(model);
        continue;
      }

      model.scale.setScalar(fitScaleForCell(model, cellW, rowDepth, LEVEL_HEIGHT));
      const pos = this.binWorldPos(bin);
      model.position.set(pos.x, pos.y, pos.z);
      model.userData.binId = bin.bin_id; // para poder resolver el click exacto sobre el objeto real, ver resolveBinAtPointer
      targetGroup.add(model);
      this.stockObjects.set(bin.bin_id, model);
    }
  }

  setSelectCellHandler(handler: ((bin: Bin) => void) | null) {
    this.onSelectCell = handler;
    if (!handler) this.clearSelection();
  }

  /** Modo solo-vista: clickear una casilla ya guardada la selecciona (para mostrar qué hay ahí) sin
   * tocar su contenido — a diferencia de setSelectCellHandler, no pone ningún modelo nuevo encima. */
  setViewSelectHandler(handler: ((bin: Bin) => void) | null) {
    this.onSelectExisting = handler;
    if (!handler) this.clearSelection();
  }

  /** Modelo 3D real del producto que se está por guardar acá — el mismo que tiene asignado en el Catálogo. */
  setProductModel(path: string | null) {
    this.productModelPath = path;
  }

  setObjectAdjustment(scaleMultiplier: number, extraRotationDeg: number) {
    if (!this.objectMesh) return;
    this.objectMesh.scale.setScalar(this.objectBaseFit * scaleMultiplier);
    this.objectMesh.rotation.y = this.objectBaseRotation + THREE.MathUtils.degToRad(extraRotationDeg);
  }

  private clearSelection() {
    this.selectedBin = null;
    this.objectRequestSeq++;
    if (this.objectMesh) {
      this.bayGroup?.remove(this.objectMesh);
      disposeObject3D(this.objectMesh);
      this.objectMesh = null;
    }
    this.setSelectedElementMarker(null);
    this.setHoveredBin(null);
  }

  /** Contorno alrededor del elemento real seleccionado (modo solo-vista) — null si la casilla está
   * vacía (no hay nada que resaltar) o si se deselecciona. */
  private setSelectedElementMarker(bin: Bin | null) {
    if (this.selectedElementMarker) {
      this.scene.remove(this.selectedElementMarker);
      this.selectedElementMarker.dispose();
      this.selectedElementMarker = null;
    }
    const object = bin ? this.stockObjects.get(bin.bin_id) : null;
    if (!object) return;
    const helper = new THREE.BoxHelper(object, 0xf5a623);
    this.scene.add(helper);
    this.selectedElementMarker = helper;
  }

  private binWorldPos(bin: Bin): THREE.Vector3 {
    const bayCount = Math.max(1, Math.round(this.currentWidth / CUBE_SIZE));
    const cw = this.currentWidth / bayCount;
    const x = -this.currentWidth / 2 + cw * (bin.bay + 0.5);
    const y = LEVEL_HEIGHT * bin.level;
    // Centro real de la fila de esa cara, no su borde: con profundidad 1 hay
    // una sola fila (centrada en 0); con profundidad 2 cada cara es media
    // fila propia, centrada a ±1/4 de la profundidad total.
    const rowDepth = this.currentDepth / this.currentDepthCubes;
    const z = this.currentDepthCubes === 1 ? 0 : (bin.face === 0 ? rowDepth / 2 : -rowDepth / 2);
    return new THREE.Vector3(x, y, z);
  }

  /** Bin real bajo el puntero. Primero prueba contra los objetos YA puestos (selección exacta sobre
   * el elemento real, sin importar desde qué cara/ángulo se mire — antes se aproximaba con bay/level
   * sobre un plano y dependía de currentFace, así que clickear el elemento mirando desde atrás podía
   * no encontrar nada). Si el rayo no golpea ningún objeto (casilla vacía, no hay nada que clickear),
   * cae al cálculo aproximado sobre la estructura del rack. */
  private resolveBinAtPointer(e: PointerEvent): Bin | null {
    if (!this.bayGroup) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.orbitCam.camera);

    const stockHits = raycaster.intersectObjects(Array.from(this.stockObjects.values()), true);
    if (stockHits.length > 0) {
      let obj: THREE.Object3D | null = stockHits[0].object;
      while (obj && obj.userData.binId === undefined) obj = obj.parent;
      const binId = obj?.userData.binId as number | undefined;
      const bin = binId !== undefined ? this.bins.find((b) => b.bin_id === binId) : undefined;
      if (bin) return bin;
    }

    const hits = raycaster.intersectObject(this.bayGroup, true);
    if (hits.length === 0) return null;
    const point = hits[0].point;
    const bayCount = Math.max(1, Math.round(this.currentWidth / CUBE_SIZE));
    const cellW = this.currentWidth / bayCount;
    const bay = Math.min(bayCount - 1, Math.max(0, Math.floor((point.x + this.currentWidth / 2) / cellW)));
    const level = Math.min(this.currentLevels, Math.max(1, Math.round(point.y / LEVEL_HEIGHT)));
    return this.bins.find((b) => b.bay === bay && b.level === level && b.face === this.currentFace) ?? null;
  }

  /** Resalta la casilla (cuadro) que el mouse tiene debajo — señal de "acá vas a poner el elemento"
   * (o, en modo solo-vista, "esto es lo que vas a seleccionar"). */
  private updateBinHover(e: PointerEvent) {
    // El cuadro celeste de "acá vas a quedar" solo tiene sentido en pickMode (elegir dónde guardar
    // un ítem nuevo, antes de clickear). En modo solo-vista no se muestra — ahí la única marca es el
    // contorno sobre el elemento real, recién al seleccionarlo (ver setSelectedElementMarker).
    if (!this.onSelectCell) {
      this.setHoveredBin(null);
      return;
    }
    this.setHoveredBin(this.resolveBinAtPointer(e));
  }

  private setHoveredBin(bin: Bin | null) {
    if (bin === this.hoveredBin) return;
    this.hoveredBin = bin;
    if (this.hoverMarker) {
      this.bayGroup?.remove(this.hoverMarker);
      disposeObject3D(this.hoverMarker);
      this.hoverMarker = null;
    }
    if (!bin || !this.bayGroup) return;
    const bayCount = Math.max(1, Math.round(this.currentWidth / CUBE_SIZE));
    const cellW = this.currentWidth / bayCount;
    // Mismo nivel que donde en verdad se apoya el objeto (LEVEL_HEIGHT * level) —
    // antes esto marcaba medio nivel más abajo, así que el resalte y el
    // objeto puesto quedaban en cuadros distintos.
    const centerY = LEVEL_HEIGHT * bin.level;
    const x = -this.currentWidth / 2 + cellW * (bin.bay + 0.5);

    const group = new THREE.Group();
    const geom = new THREE.PlaneGeometry(cellW * 0.85, LEVEL_HEIGHT * 0.85);
    const plane = new THREE.Mesh(geom, new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.3, side: THREE.DoubleSide }));
    group.add(plane);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geom), new THREE.LineBasicMaterial({ color: '#38bdf8' }));
    group.add(outline);
    const z = bin.face === 0 ? this.currentDepth / 2 + 0.01 : -this.currentDepth / 2 - 0.01;
    group.position.set(x, centerY, z);
    this.bayGroup.add(group);
    this.hoverMarker = group;
  }

  /** Carga y ubica el modelo real del producto (si tiene uno asignado en el Catálogo), o el genérico si no, apoyado sobre el nivel de esta casilla. */
  private async placeObjectInCell(bin: Bin) {
    if (!this.bayGroup) return;
    const bayCount = Math.max(1, Math.round(this.currentWidth / CUBE_SIZE));
    const cellW = this.currentWidth / bayCount;
    const rowDepth = this.currentDepth / this.currentDepthCubes;
    const requestId = ++this.objectRequestSeq;

    let model: THREE.Object3D | null = null;
    if (this.productModelPath) model = await loadProductModel(this.productModelPath).catch(() => null);
    if (!model) model = await loadObjectModel('bulto').catch(() => null);
    if (!model || requestId !== this.objectRequestSeq || !this.bayGroup) return;

    const fitSize = fitScaleForCell(model, cellW, rowDepth, LEVEL_HEIGHT);
    this.objectBaseFit = fitSize;
    this.objectBaseRotation = GENERIC_OBJECT_FIT.rotationY;
    model.scale.setScalar(fitSize);
    model.rotation.y = GENERIC_OBJECT_FIT.rotationY;
    const pos = this.binWorldPos(bin);
    model.position.set(pos.x, pos.y, pos.z);
    if (this.objectMesh) {
      this.bayGroup.remove(this.objectMesh);
      disposeObject3D(this.objectMesh);
    }
    this.objectMesh = model;
    this.bayGroup.add(model);
  }

  private handleClick(e: PointerEvent) {
    if ((!this.onSelectCell && !this.onSelectExisting) || !this.bayGroup) return;
    const bin = this.resolveBinAtPointer(e);
    if (!bin) return;
    this.selectedBin = bin;
    if (this.onSelectCell) {
      this.placeObjectInCell(bin); // elegir ubicación: pone el ítem nuevo encima, tenga o no algo ya guardado
      this.onSelectCell(bin);
    } else {
      this.setSelectedElementMarker(bin); // solo-vista: resalta el elemento real, nunca toca lo que ya está puesto
      this.onSelectExisting?.(bin);
    }
  }

  getSelectedCellScreenPos(): { x: number; y: number } | null {
    if (!this.selectedBin) return null;
    const pos = this.binWorldPos(this.selectedBin);
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
