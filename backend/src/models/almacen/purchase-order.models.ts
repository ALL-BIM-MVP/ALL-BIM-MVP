import type { PurchaseOrderItemProgress, StatusAlert } from "./document-status.models.js";

// purchase_orders (órdenes de compra) — ver database/schema.sql y
// docs/almacen-ingreso-productos/05-roadmap.md, Fase 5. Los NUMERIC llegan como
// string desde pg: el backend no los suma con `+`.
export interface PurchaseOrderRow {
    purchase_order_id: number;
    project_id: number;
    number: string;
    // Fecha sin hora como texto "YYYY-MM-DD" (to_char en el SELECT).
    order_date: string;
    currency: "PEN" | "USD";
    commercial_terms: string | null;
    // Total tal como figura en el documento (null = no lo indica).
    total_amount: string | null;
    // Suma de line_total de las líneas, calculada al consultar (no se guarda).
    lines_total: string;
    supplier: { supplier_id: number; ruc: string; name: string };
    // Origen opcional: null = compra directa (sin requerimiento / sin cotización).
    purchase_requisition: { purchase_requisition_id: number; number: string } | null;
    quotation: { quotation_id: number; number: string } | null;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
    items_count: number;
    // false = "archivo pendiente" (el documento físico aún no se adjuntó).
    has_file: boolean;
}

export interface PurchaseOrderItem {
    purchase_order_item_id: number;
    purchase_order_id: number;
    quotation_item_id: number | null;
    purchase_requisition_item_id: number | null;
    product_id: number;
    description: string;
    quantity_ordered: string;
    unit_price: string | null;
    discount_amount: string | null;
    tax_amount: string | null;
    line_total: string;
    notes: string | null;
    product: { product_id: number; code: string; name: string; unit: string };
    // Origen de la línea (null = la línea no cita ese documento).
    quotation_item: { quotation_item_id: number; description: string; quantity_quoted: string } | null;
    requisition_item: { purchase_requisition_item_id: number; description: string; quantity_requested: string } | null;
    // Derivado (Fase 8): avance acumulado de la línea (ordenado / facturado / recibido / pendiente) y avisos.
    progress: PurchaseOrderItemProgress;
    alerts: StatusAlert[];
}

export interface PurchaseOrderFile {
    file_id: number;
    name: string;
    mime_type: string | null;
    file_size: string | null;
    url: string;
}

export interface PurchaseOrderDetail extends Omit<PurchaseOrderRow, "items_count" | "has_file"> {
    items: PurchaseOrderItem[];
    file: PurchaseOrderFile | null;
    alerts: StatusAlert[];
}
