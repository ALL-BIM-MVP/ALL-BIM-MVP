// invoices (facturas) — ver database/schema.sql y
// docs/almacen-ingreso-productos/05-roadmap.md, Fase 6. Los NUMERIC llegan como
// string desde pg: el backend no los suma con `+`.
export interface InvoiceRow {
    invoice_id: number;
    project_id: number;
    series: string;
    number: string;
    // Fecha sin hora como texto "YYYY-MM-DD" (to_char en el SELECT).
    invoice_date: string;
    currency: "PEN" | "USD";
    // Montos tal como figuran en el documento (null = no figura).
    subtotal_amount: string | null;
    tax_amount: string | null;
    total_amount: string | null;
    // Suma de line_total de las líneas, calculada al consultar (no se guarda).
    lines_total: string;
    supplier: { supplier_id: number; ruc: string; name: string };
    // Origen opcional: null = factura sin orden de compra.
    purchase_order: { purchase_order_id: number; number: string } | null;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
    items_count: number;
    // false = "archivo pendiente" (el documento físico aún no se adjuntó).
    has_file: boolean;
}

export interface InvoiceItem {
    invoice_item_id: number;
    invoice_id: number;
    purchase_order_item_id: number | null;
    product_id: number;
    description: string;
    quantity_invoiced: string;
    unit_price: string | null;
    discount_amount: string | null;
    tax_amount: string | null;
    line_total: string;
    notes: string | null;
    product: { product_id: number; code: string; name: string; unit: string };
    // Lo que decía la línea de la orden (null = la factura no tiene orden).
    purchase_order_item: { purchase_order_item_id: number; description: string; quantity_ordered: string } | null;
}

export interface InvoiceFile {
    file_id: number;
    name: string;
    mime_type: string | null;
    file_size: string | null;
    url: string;
}

export interface InvoiceDetail extends Omit<InvoiceRow, "items_count" | "has_file"> {
    items: InvoiceItem[];
    file: InvoiceFile | null;
}
