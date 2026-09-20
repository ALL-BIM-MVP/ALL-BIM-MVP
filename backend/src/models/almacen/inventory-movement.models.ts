// inventory_movements (Kardex) — ver
// docs/roadmap/almacen-bim-base-datos.md 4.6. Historial inmutable,
// `resulting_balance` es un snapshot calculado al insertar (nunca se
// recalcula al leer).
export interface InventoryMovementRow {
    inventory_movement_id: number;
    product_id: number;
    // Valor real en español — dato de negocio (mismo criterio que
    // warehouses.direction).
    type: "entrada" | "salida";
    quantity: number;
    bin_id: number;
    resulting_balance: number;
    // Discriminador técnico (a qué tabla apunta reference_document_id)
    // — en inglés, matcheando el nombre real de esas tablas.
    reference_document_type: "goods_receipt" | "goods_issue" | "inventory_adjustment";
    reference_document_id: number;
    // Fecha del documento que originó el movimiento, "AAAA-MM-DD" (es la que
    // usa el filtro del Kardex). created_at es cuándo se registró.
    movement_date: string;
    created_at: Date;
    created_by: number;
}
