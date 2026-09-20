// goods_receipts (Ingreso) — ver docs/roadmap/almacen-bim-base-datos.md
// 4.1-4.3. Registro de movimiento INMUTABLE: sin PUT/DELETE, un error
// se corrige con un movimiento nuevo, nunca reescribiendo este.
// El proveedor viaja embebido (RUC y nombre salen de `suppliers`, no se
// guardan en el ingreso).
export interface GoodsReceiptSupplier {
    supplier_id: number;
    ruc: string;
    name: string;
}

export interface GoodsReceiptRow {
    goods_receipt_id: number;
    project_id: number;
    supplier: GoodsReceiptSupplier;
    delivery_note_series: string;
    delivery_note_number: string;
    // Fechas "solo día" como texto AAAA-MM-DD (no un Date con zona horaria).
    delivery_note_date: string;
    received_date: string;
    created_at: Date;
    created_by: number;
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
    product_id: number;
    // Lo recibido físicamente (suma al stock).
    total_quantity: number;
    // Lo que decía la guía; null si no se registró.
    quantity_per_delivery_note: number | null;
}

export interface GoodsReceiptItemWithLocations extends GoodsReceiptItemRow {
    locations: GoodsReceiptItemLocationRow[];
}

export interface GoodsReceiptDetail extends GoodsReceiptRow {
    items: GoodsReceiptItemWithLocations[];
}
