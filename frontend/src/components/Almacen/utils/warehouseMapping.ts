// Traduce entre el modelo 3D local de "Ciudad" (posición x/z + rotación en
// radianes) y el shape real que pide el backend para un almacén
// (corner1/corner2 + direction cardinal) — así CityScene no necesita saber
// nada de la forma del backend.
import { WarehouseDirection } from '../../../types/almacen.types';
import { Footprint } from './CityScene';

export const CUBE_SIZE = 1.3;

// Tamaño del interior (grid_width/grid_depth, en cubos) todavía sin selector
// propio en la UI — fijo para todo almacén nuevo hasta que se arme uno.
export const DEFAULT_GRID = { width: 28, depth: 18 };

const DIRECTIONS: WarehouseDirection[] = ['norte', 'este', 'sur', 'oeste'];

/** Redondea la rotación libre de la casa al múltiplo de 90° más cercano y la mapea a un lado cardinal. */
export function rotationToDirection(rotationY: number): WarehouseDirection {
  const steps = Math.round(rotationY / (Math.PI / 2));
  return DIRECTIONS[((steps % 4) + 4) % 4];
}

export function directionToRotation(direction: WarehouseDirection): number {
  const idx = DIRECTIONS.indexOf(direction);
  return (idx < 0 ? 0 : idx) * (Math.PI / 2);
}

/** Índice de cubo (entero) → metros reales, redondeado a 6 decimales — sin
 * esto, "3 * CUBE_SIZE" puede dar 3.9000000000000004 (binario de 1.3 no es
 * exacto) y el backend rechaza la esquina por no caer justo en la grilla. */
export function cubesToMeters(cubes: number): number {
  return Math.round(cubes * CUBE_SIZE * 1e6) / 1e6;
}

/** Esquinas del rectángulo exterior — swapea ancho/profundo si la rotación es de 90°/270°. */
export function footprintCorners(x: number, z: number, rotationY: number, footprint: Footprint) {
  const steps = Math.round(rotationY / (Math.PI / 2));
  const swapped = (((steps % 2) + 2) % 2) === 1;
  const width = swapped ? footprint.depth : footprint.width;
  const depth = swapped ? footprint.width : footprint.depth;
  return {
    corner1_x: x - width / 2,
    corner1_z: z - depth / 2,
    corner2_x: x + width / 2,
    corner2_z: z + depth / 2,
  };
}

/** Inverso de footprintCorners: reconstruye el ancho/profundidad LOCAL (antes de rotar) a partir de
 * las esquinas absolutas guardadas en el backend — necesario para volver a dibujar un almacén ya
 * creado con su tamaño real en vez de uno fijo. */
export function footprintFromCorners(corner1_x: number, corner1_z: number, corner2_x: number, corner2_z: number, rotationY: number): Footprint {
  const absWidth = Math.abs(corner2_x - corner1_x);
  const absDepth = Math.abs(corner2_z - corner1_z);
  const steps = Math.round(rotationY / (Math.PI / 2));
  const swapped = (((steps % 2) + 2) % 2) === 1;
  return swapped ? { width: absDepth, depth: absWidth } : { width: absWidth, depth: absDepth };
}
