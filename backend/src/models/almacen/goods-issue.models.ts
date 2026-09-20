import type { ItemAdjustmentSummary } from "./inventory-adjustment.models.js";

// goods_issues (Vale de Salida) — ver
// docs/roadmap/almacen-bim-base-datos.md 4.4-4.5. Simétrico a
// goods_receipts (resta en vez de sumar), registro de movimiento
// INMUTABLE — sin PUT/DELETE.
export interface GoodsIssueRow {
    goods_issue_id: number;
    project_id: number;
    destination_sector: string;
    destination_level: string;
    destination_block: string;
    // Quién retira físicamente el material — texto libre, NO es un
    // usuario del sistema (distinto de created_by, que es quien lo
    // REGISTRÓ acá).
    recipient_name: string;
    recipient_dni: string;
    // Fecha "solo día" como texto AAAA-MM-DD (no un Date con zona horaria).
    issue_date: string;
    created_at: Date;
    created_by: number;
    // Anulado (Fase 10): un ajuste devolvió todo el material al stock.
    voided: boolean;
    voided_at: Date | null;
}

export interface GoodsIssueItemLocationRow {
    goods_issue_item_location_id: number;
    goods_issue_item_id: number;
    bin_id: number;
    quantity: number;
}

export interface GoodsIssueItemRow {
    goods_issue_item_id: number;
    goods_issue_id: number;
    product_id: number;
    total_quantity: number;
}

// Ajustes de la línea (Fase 10): la cantidad registrada no cambia; lo efectivo es lo registrado más los ajustes.
export interface GoodsIssueItemWithLocations extends GoodsIssueItemRow, ItemAdjustmentSummary {
    locations: GoodsIssueItemLocationRow[];
}

export interface GoodsIssueDetail extends GoodsIssueRow {
    items: GoodsIssueItemWithLocations[];
}
