import type { ModelBounds } from '../types';

// Multiplica un punto local (x,y,z) por una matriz 4x4 ROW-MAJOR (confirmado con los
// datos reales: la traslación aparece en los índices 3, 7 y 11 — el final de cada
// fila — no en 12/13/14 como sería en column-major).
// Layout: [m00 m01 m02 tx | m10 m11 m12 ty | m20 m21 m22 tz | 0 0 0 1]
export function transformPoint(
  x: number, y: number, z: number,
  m: number[] | Float32Array
): [number, number, number] {
  const wx = m[0] * x + m[1] * y + m[2] * z + m[3];
  const wy = m[4] * x + m[5] * y + m[6] * z + m[7];
  const wz = m[8] * x + m[9] * y + m[10] * z + m[11];
  return [wx, wy, wz];
}

// Calcula el bounding box del modelo en espacio MUNDIAL, transformando cada mesh
// con su propia matriz localToWorld. Las posiciones de cada mesh vienen en su
// espacio local (relativo a `origin`), así que compararlas directamente sin
// transformar produce un bounding box incorrecto.
export function computeModelBounds(meshes: any[]): ModelBounds | null {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let found = false;

  for (const mesh of meshes) {
    const positions: number[] | Float32Array | undefined = mesh?.positions ?? mesh?.vertices;
    if (!positions || positions.length < 3) continue;

    const matrix: number[] | Float32Array | undefined = mesh?.localToWorld;
    found = true;

    for (let i = 0; i < positions.length; i += 3) {
      const lx = positions[i];
      const ly = positions[i + 1];
      const lz = positions[i + 2];

      let x = lx, y = ly, z = lz;
      if (matrix && matrix.length === 16) {
        [x, y, z] = transformPoint(lx, ly, lz, matrix);
      }

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }

  if (!found) return null;
  return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}