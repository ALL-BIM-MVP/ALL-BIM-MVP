import type { CasillaRow } from "./casilla.models.js";

// estante — ver docs/roadmap/almacen-bim-base-datos.md 1.3.
export interface EstanteRow {
    estante_id: number;
    almacen_id: number;
    nombre: string;
    esquina1_x: number;
    esquina1_z: number;
    esquina2_x: number;
    esquina2_z: number;
    niveles: number;
    // 0 | 1 — cuál de las 2 caras es la accesible/abierta (ver
    // comentario largo en database/schema.sql, estante.direccion).
    direccion: number;
    creado_en: Date;
    creado_por: number;
    actualizado_en: Date | null;
    actualizado_por: number | null;
}

// Ancho (bahías) y profundidad (1 o 2) NO son columnas — se derivan de
// las esquinas (ver diseño 1.3, resolverGeometriaEstante en
// services/almacen/estante.service.ts). Se exponen en la respuesta
// para que el frontend no tenga que rehacer la cuenta.
export interface EstanteFull extends EstanteRow {
    ancho: number;
    profundidad: number;
}

export interface EstanteConCasillas extends EstanteFull {
    casillas: CasillaRow[];
}
