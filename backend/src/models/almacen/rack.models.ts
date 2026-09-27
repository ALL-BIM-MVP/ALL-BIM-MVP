import type { BinWithContents } from "./bin.models.js";

// racks — ver docs/roadmap/almacen-bim-base-datos.md 1.3. corner1/corner2 son índices
// ENTEROS de la grilla interior del warehouse (nunca metros): junto con `bays`/`depth`
// (datos propios, tan directos como `levels`) le dicen a quien lee dónde arranca el
// estante y hacia qué esquina llega. Ver el comentario grande en database/schema.sql.
export interface RackRow {
    rack_id: number;
    warehouse_id: number;
    name: string;
    corner1_x: number;
    corner1_z: number;
    corner2_x: number;
    corner2_z: number;
    bays: number;
    // 1 | 2 — una cara o doble cara.
    depth: number;
    levels: number;
    // 0 | 1 — cuál de las 2 caras es la accesible/abierta (ver
    // comentario largo en database/schema.sql, racks.direction).
    direction: number;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
}

export interface RackWithBins extends RackRow {
    bins: BinWithContents[];
}
