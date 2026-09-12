// warehouses ("la casa") — ver docs/roadmap/almacen-bim-base-datos.md 1.2.
export interface WarehouseRow {
    warehouse_id: number;
    project_id: number;
    warehouse_style_id: number;
    name: string;
    corner1_x: number;
    corner1_z: number;
    corner2_x: number;
    corner2_z: number;
    // Valor real en español — dato de negocio, no identificador de
    // esquema (mismo criterio que el resto del módulo).
    direction: "norte" | "sur" | "este" | "oeste";
    area_m2: number;
    grid_width: number;
    grid_depth: number;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
}
