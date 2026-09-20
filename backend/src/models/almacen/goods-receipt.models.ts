import type { PurchaseOrderItemProgress, ReceiptDocuments, StatusAlert } from "./document-status.models.js";

// goods_receipts (Ingreso = guía de remisión + ubicación) — ver
// docs/roadmap/almacen-bim-base-datos.md 4.1-4.3 y
// docs/almacen-ingreso-productos/05-roadmap.md, Fase 7. Registro inmutable en lo
// físico (cantidades, productos, casillas, fecha de recepción): un error de esos
// datos se corrige con un movimiento nuevo (Fase 10). Sí se corrigen, con
// auditoría, los datos administrativos de la guía, el vínculo con la orden y el
// archivo. El proveedor viaja embebido (RUC y nombre salen de `suppliers`).
export interface GoodsReceiptSupplier {
    supplier_id: number;
    ruc: string;
    name: string;
}

export interface GoodsReceiptRow {
    goods_receipt_id: number;
    project_id: number;
    supplier: GoodsReceiptSupplier;
    // 'rapida' = sin documentos previos; 'normal' = sigue el proceso (su orden puede estar pendiente).
    entry_type: "normal" | "rapida";
    // null = sin orden (entrada rápida, o normal aún pendiente de vincular).
    purchase_order: { purchase_order_id: number; number: string } | null;
    delivery_note_series: string;
    delivery_note_number: string;
    // Fechas "solo día" como texto AAAA-MM-DD (no un Date con zona horaria).
    delivery_note_date: string;
    received_date: string;
    // false = "archivo pendiente" (la guía firmada aún no se adjuntó).
    has_file: boolean;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
    // Derivado (Fase 8): "expediente" del ingreso (qué documentos tiene su cadena) y avisos del documento.
    documents: ReceiptDocuments;
    alerts: StatusAlert[];
}

export interface GoodsReceiptItemLocationRow {
    goods_receipt_item_location_id: number;
    goods_receipt_item_id: number;
    bin_id: number;
    quantity: number;
}

export interface GoodsReceiptItemRow {
    goods_receipt_item_id: number;
    goods_receipt_id: number;
    purchase_order_item_id: number | null;
    product_id: number;
    // Lo recibido físicamente (suma al stock). Mismo nombre que en el vale de salida.
    total_quantity: number;
    // Lo que decía la guía; null si no se registró.
    quantity_per_delivery_note: number | null;
    // Lo que decía la línea de la orden (null = el ingreso no tiene orden).
    purchase_order_item: { purchase_order_item_id: number; description: string; quantity_ordered: string } | null;
    // Derivado (Fase 8): avance ACUMULADO de la línea de orden que esta línea recibe (null sin orden) y avisos.
    purchase_order_progress: PurchaseOrderItemProgress | null;
    alerts: StatusAlert[];
}

export interface GoodsReceiptItemWithLocations extends GoodsReceiptItemRow {
    locations: GoodsReceiptItemLocationRow[];
}

export interface GoodsReceiptFile {
    file_id: number;
    name: string;
    mime_type: string | null;
    file_size: string | null;
    url: string;
}

export interface GoodsReceiptDetail extends GoodsReceiptRow {
    items: GoodsReceiptItemWithLocations[];
    file: GoodsReceiptFile | null;
}
