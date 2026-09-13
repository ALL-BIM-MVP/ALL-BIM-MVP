import type { BinWithContents } from "./bin.models.js";

// racks — ver docs/roadmap/almacen-bim-base-datos.md 1.3.
export interface RackRow {
    rack_id: number;
    warehouse_id: number;
    name: string;
    corner1_x: number;
    corner1_z: number;
    corner2_x: number;
    corner2_z: number;
    levels: number;
    // 0 | 1 — cuál de las 2 caras es la accesible/abierta (ver
    // comentario largo en database/schema.sql, racks.direction).
    direction: number;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
}

// Ancho (bahías) y profundidad (1 o 2) NO son columnas — se derivan de
// las esquinas (ver diseño 1.3, resolveRackGeometry en
// services/almacen/rack.service.ts). Se exponen en la respuesta para
// que el frontend no tenga que rehacer la cuenta.
export interface RackFull extends RackRow {
    width: number;
    depth: number;
}

export interface RackWithBins extends RackFull {
    bins: BinWithContents[];
}
