// Snap a vértice y snap a arista, ambos comparando en ESPACIO DE PANTALLA (píxeles).
// El punto de impacto del raycast cae dentro de una cara; comparar en 3D contra
// vértices/aristas casi nunca engancha. Comparar en píxeles (lo que el usuario ve
// y apunta) sí — es el mismo criterio que usan Dalux, Revit, SketchUp, etc.
import { useCallback } from 'react';

interface Vec3 { x: number; y: number; z: number; }
interface ScreenPos { x: number; y: number; }
interface Edge { a: Vec3; b: Vec3; }

export type SnapType = 'vertex' | 'edge' | 'none';

export interface SnapResult {
  point: Vec3;
  snapped: boolean;
  snapType: SnapType;
  distancePx: number;
  edge?: Edge; // presente solo cuando snapType === 'edge', para resaltar la arista completa
}

interface SnapOptions {
  worldPrefilterRadius?: number; // metros, filtro grueso en 3D antes de proyectar
  vertexPixelThreshold?: number; // px, radio de enganche a vértice
  edgePixelThreshold?: number;   // px, radio de enganche a arista
}

// Punto más cercano sobre un segmento 2D [a,b] a un punto p. Devuelve t (0-1) y
// las coordenadas del punto proyectado sobre el segmento.
function closestOnSegment2D(p: ScreenPos, a: ScreenPos, b: ScreenPos) {
  const abx = b.x - a.x, aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  let t = lenSq > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  return { t, x: a.x + abx * t, y: a.y + aby * t };
}

// Distancia (al cuadrado) de un punto a un segmento en 3D — filtro grueso barato.
function distSqPointToSegment3D(p: Vec3, a: Vec3, b: Vec3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  let t = lenSq > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + abx * t, cy = a.y + aby * t, cz = a.z + abz * t;
  const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
  return dx * dx + dy * dy + dz * dz;
}

export function useSnap() {
  const snapToVertex = useCallback((
    rawPoint: Vec3,
    vertices: Vec3[],
    mouseScreen: ScreenPos,
    projectToScreen: (p: Vec3) => ScreenPos | null,
    worldRadius: number,
    pixelThreshold: number
  ): { point: Vec3 | null; distancePx: number; candidatesConsidered: number } => {
    const worldRadiusSq = worldRadius * worldRadius;
    let best: Vec3 | null = null;
    let bestPx = Infinity;
    let candidatesConsidered = 0;

    for (const v of vertices) {
      const dx = v.x - rawPoint.x, dy = v.y - rawPoint.y, dz = v.z - rawPoint.z;
      if (dx * dx + dy * dy + dz * dz > worldRadiusSq) continue;
      candidatesConsidered++;

      const screen = projectToScreen(v);
      if (!screen) continue;

      const pxDist = Math.hypot(screen.x - mouseScreen.x, screen.y - mouseScreen.y);
      if (pxDist < bestPx) {
        bestPx = pxDist;
        best = v;
      }
    }

    return { point: bestPx <= pixelThreshold ? best : null, distancePx: bestPx, candidatesConsidered };
  }, []);

  const snapToEdge = useCallback((
    rawPoint: Vec3,
    edges: Edge[],
    mouseScreen: ScreenPos,
    projectToScreen: (p: Vec3) => ScreenPos | null,
    worldRadius: number,
    pixelThreshold: number
  ): { point: Vec3; distancePx: number; edge: Edge } | null => {
    const worldRadiusSq = worldRadius * worldRadius;
    let best: { point: Vec3; distancePx: number; edge: Edge } | null = null;

    for (const edge of edges) {
      // Filtro grueso en 3D: descarta aristas lejos del punto de impacto.
      if (distSqPointToSegment3D(rawPoint, edge.a, edge.b) > worldRadiusSq) continue;

      const screenA = projectToScreen(edge.a);
      const screenB = projectToScreen(edge.b);
      if (!screenA || !screenB) continue;

      const closest = closestOnSegment2D(mouseScreen, screenA, screenB);
      const pxDist = Math.hypot(closest.x - mouseScreen.x, closest.y - mouseScreen.y);
      if (!best || pxDist < best.distancePx) {
        // Interpola el punto 3D real sobre la arista usando el mismo t hallado en 2D.
        const point: Vec3 = {
          x: edge.a.x + (edge.b.x - edge.a.x) * closest.t,
          y: edge.a.y + (edge.b.y - edge.a.y) * closest.t,
          z: edge.a.z + (edge.b.z - edge.a.z) * closest.t,
        };
        best = { point, distancePx: pxDist, edge };
      }
    }

    if (best && best.distancePx <= pixelThreshold) return best;
    return null;
  }, []);

  // Snap combinado: prioriza vértice (más preciso) y cae a arista si no hay vértice cerca.
  const snap = useCallback((
    rawPoint: Vec3,
    vertices: Vec3[],
    edges: Edge[],
    mouseScreen: ScreenPos,
    projectToScreen: (p: Vec3) => ScreenPos | null,
    options: SnapOptions = {}
  ): SnapResult => {
    const worldRadius = options.worldPrefilterRadius ?? 2;
    const vertexPx = options.vertexPixelThreshold ?? 12;
    const edgePx = options.edgePixelThreshold ?? 14;

    const vertexResult = snapToVertex(rawPoint, vertices, mouseScreen, projectToScreen, worldRadius, vertexPx);

    // 🧪 DIAGNÓSTICO TEMPORAL: cuántos vértices pasaron el filtro grueso, y qué
    // tan cerca (en píxeles) estuvo el más próximo, aunque no haya enganchado.
    console.log('🟡 snap debug', {
      totalVertices: vertices.length,
      totalEdges: edges.length,
      vertexCandidatesEnRadio: vertexResult.candidatesConsidered,
      distanciaPxAlVerticeMasCercano: vertexResult.distancePx === Infinity ? 'ninguno en radio' : vertexResult.distancePx.toFixed(1),
      umbralVertexPx: vertexPx,
    });

    if (vertexResult.point) {
      return { point: vertexResult.point, snapped: true, snapType: 'vertex', distancePx: vertexResult.distancePx };
    }

    const edgeHit = snapToEdge(rawPoint, edges, mouseScreen, projectToScreen, worldRadius, edgePx);
    if (edgeHit) {
      return { point: edgeHit.point, snapped: true, snapType: 'edge', distancePx: edgeHit.distancePx, edge: edgeHit.edge };
    }

    return { point: rawPoint, snapped: false, snapType: 'none', distancePx: Infinity };
  }, [snapToVertex, snapToEdge]);

  return { snap };
}