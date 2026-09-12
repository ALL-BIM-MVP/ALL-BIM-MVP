// almacen ("la casa") — ver docs/roadmap/almacen-bim-base-datos.md 1.2.
export interface AlmacenRow {
    almacen_id: number;
    project_id: number;
    almacen_estilo_id: number;
    nombre: string;
    esquina1_x: number;
    esquina1_z: number;
    esquina2_x: number;
    esquina2_z: number;
    direccion: "norte" | "sur" | "este" | "oeste";
    area_m2: number;
    grid_ancho: number;
    grid_profundo: number;
    creado_en: Date;
    creado_por: number;
    actualizado_en: Date | null;
    actualizado_por: number | null;
}
