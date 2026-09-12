// goods_receipts (Ingreso) — ver docs/roadmap/almacen-bim-base-datos.md
// 4.1-4.3. Registro de movimiento INMUTABLE: sin PUT/DELETE, un error
// se corrige con un movimiento nuevo, nunca reescribiendo este.
export interface GoodsReceiptRow {
    goods_receipt_id: number;
    project_id: number;
    supplier_ruc: string;
    supplier_name: string;
    delivery_note_number: string;
    purchase_date: Date;
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
    total_quantity: number;
}

export interface GoodsReceiptItemWithLocations extends GoodsReceiptItemRow {
    locations: GoodsReceiptItemLocationRow[];
}

export interface GoodsReceiptDetail extends GoodsReceiptRow {
    items: GoodsReceiptItemWithLocations[];
}
