// categories — ver docs/roadmap/almacen-bim-base-datos.md 2.1. Para
// esta versión son exactamente 3 filas por proyecto, cerradas (Partida
// fija + Materiales/Equipo relacionales a Partida) — se crean solas al
// dar de alta el proyecto, ver services/almacen/category.service.ts.
export interface CategoryRow {
    category_id: number;
    project_id: number;
    name: string;
    // Valores reales en español — dato de negocio (mismo criterio que
    // warehouses.direction).
    type: "fijo" | "relacional";
    prefix: string | null;
    base_category_id: number | null;
    next_display_id: number;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
}
