import type { RequisitionItemProgress, RequisitionSummary, StatusAlert } from "./document-status.models.js";

// purchase_requisitions (requerimientos) — ver database/schema.sql y
// docs/almacen-ingreso-productos/05-roadmap.md, Fase 3. Los NUMERIC
// (cantidad, precio) llegan como string desde pg: el backend no los suma.
export interface PurchaseRequisitionRow {
    purchase_requisition_id: number;
    project_id: number;
    number: string;
    // Fecha sin hora como texto "YYYY-MM-DD" (to_char en el SELECT).
    requisition_date: string;
    requester: string;
    notes: string | null;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
    items_count: number;
    // false = "archivo pendiente" (el documento físico aún no se adjuntó).
    has_file: boolean;
}

export interface PurchaseRequisitionItem {
    purchase_requisition_item_id: number;
    purchase_requisition_id: number;
    product_id: number;
    description: string;
    quantity_requested: string;
    estimated_unit_price: string | null;
    product: { product_id: number; code: string; name: string; unit: string };
    // Derivado (Fase 8): avance de la línea por la cadena y avisos.
    progress: RequisitionItemProgress;
    alerts: StatusAlert[];
}

export interface PurchaseRequisitionFile {
    file_id: number;
    name: string;
    mime_type: string | null;
    file_size: string | null;
    // Path firmado listo para usar (mismo criterio que el resto de archivos).
    url: string;
}

export interface PurchaseRequisitionDetail extends Omit<PurchaseRequisitionRow, "items_count" | "has_file"> {
    items: PurchaseRequisitionItem[];
    file: PurchaseRequisitionFile | null;
    // Derivado (Fase 8): cuántas líneas ya pasaron por cada etapa, y avisos del documento.
    summary: RequisitionSummary;
    alerts: StatusAlert[];
}
