// quotations (cotizaciones) — ver database/schema.sql y
// docs/almacen-ingreso-productos/05-roadmap.md, Fase 4. Los NUMERIC (cantidades
// y montos) llegan como string desde pg: el backend no los suma con `+`.
export interface QuotationRow {
    quotation_id: number;
    project_id: number;
    number: string;
    // Fechas sin hora como texto "YYYY-MM-DD" (to_char en el SELECT).
    quotation_date: string;
    currency: "PEN" | "USD";
    commercial_terms: string | null;
    valid_until: string | null;
    // Total tal como figura en el documento (null = no lo indica).
    total_amount: string | null;
    // Suma de line_total de las líneas, calculada al consultar (no se guarda):
    // el frontend puede compararla con total_amount.
    lines_total: string;
    supplier: { supplier_id: number; ruc: string; name: string };
    purchase_requisition: { purchase_requisition_id: number; number: string };
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
    items_count: number;
    // false = "archivo pendiente" (el documento físico aún no se adjuntó).
    has_file: boolean;
}

export interface QuotationItem {
    quotation_item_id: number;
    quotation_id: number;
    purchase_requisition_item_id: number;
    product_id: number;
    description: string;
    quantity_quoted: string;
    unit_price: string | null;
    discount_amount: string | null;
    tax_amount: string | null;
    line_total: string;
    notes: string | null;
    product: { product_id: number; code: string; name: string; unit: string };
    // Lo que pedía la línea del requerimiento, para compararlo con lo cotizado.
    requisition_item: { purchase_requisition_item_id: number; description: string; quantity_requested: string };
}

export interface QuotationFile {
    file_id: number;
    name: string;
    mime_type: string | null;
    file_size: string | null;
    url: string;
}

export interface QuotationDetail extends Omit<QuotationRow, "items_count" | "has_file"> {
    items: QuotationItem[];
    file: QuotationFile | null;
}
