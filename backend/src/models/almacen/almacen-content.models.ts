// Conteos de TODO lo que Almacén guarda en un proyecto — incluye lo dado
// de baja lógica (deleted_at) y el historial, porque eso también cuenta
// como contenido a la hora de vaciar el módulo o eliminar el proyecto.
// Son COUNT(*)::int (números reales, no strings de BIGINT: no son IDs).
export interface AlmacenContentCounts {
    warehouses: number;
    racks: number;
    bins: number;
    products: number;
    goods_receipts: number;
    goods_issues: number;
    inventory_movements: number;
    // Archivos del proyecto cuyo módulo es Almacén (files.module_id).
    files: number;
}

// GET .../almacen/summary — is_empty es true solo si TODO lo de arriba
// es 0. Las 3 categorías fijas del proyecto no cuentan (no son
// contenido: se crean al dar de alta el proyecto).
export interface AlmacenContentSummary extends AlmacenContentCounts {
    is_empty: boolean;
}
