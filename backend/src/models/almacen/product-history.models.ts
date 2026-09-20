import type { ProductSummary } from "./product.models.js";

// Hoja de vida del PRODUCTO: dos procesos distintos en una sola lista.
//  - ENTRADA: un ingreso, que se despliega en sus documentos (requerimiento, cotización, orden,
//    factura y la guía con su vale de entrada). Sin guía todavía = "en_curso".
//  - SALIDA: un vale, un solo documento con sus datos.
// Cada elemento lleva `type` para que el frontend pueda reagrupar como quiera.
export type HistoryType = "entrada" | "salida";

// Una línea de un documento previo al ingreso, con los datos de su cabecera.
export interface HistoryDocumentLine {
    document_id: number;
    item_id: number;
    label: string;
    date: string;
    description: string;
    quantity: string;
    // Requerimiento: precio estimado. Cotización, orden y factura: el de la línea.
    unit_price: string | null;
    line_total: string | null;
    currency: string | null;
    supplier: { supplier_id: number; ruc: string; name: string } | null;
    requester: string | null;
}

export interface HistoryDocuments {
    requisitions: HistoryDocumentLine[];
    quotations: HistoryDocumentLine[];
    purchase_orders: HistoryDocumentLine[];
    invoices: HistoryDocumentLine[];
}

export interface HistoryLocation {
    bin_id: number;
    label: string;
    quantity: string;
    // Saldo TOTAL del producto en esa casilla justo después del movimiento (igual que el Kardex).
    balance_after: string | null;
}

export interface HistoryAdjustment {
    inventory_adjustment_id: number;
    kind: "correccion" | "anulacion";
    label: string;
    reason: string;
    date: string;
    items: { bin_id: number; label: string; quantity_delta: string; stock_effect: string; balance_after: string | null }[];
}

export interface HistoryEntry {
    type: "entrada";
    // recibido = ya tiene guía; en_curso = hay documentos previos pero todavía no llegó (sin guía).
    status: "recibido" | "en_curso";
    // Recibido: fecha de recepción (vale de entrada). En curso: la del documento más reciente.
    date: string;
    label: string;
    voided: boolean;
    receipt: {
        goods_receipt_id: number;
        goods_receipt_item_id: number;
        label: string;
        delivery_note_date: string;
        received_date: string;
        entry_type: "normal" | "rapida";
        supplier: { supplier_id: number; ruc: string; name: string };
        has_file: boolean;
        description: string;
        quantity_per_delivery_note: string | null;
    } | null;
    quantity_registered: string | null;
    quantity_adjusted: string | null;
    quantity_effective: string | null;
    locations: HistoryLocation[];
    documents: HistoryDocuments;
    adjustments: HistoryAdjustment[];
}

export interface HistoryExit {
    type: "salida";
    date: string;
    label: string;
    voided: boolean;
    issue: {
        goods_issue_id: number;
        goods_issue_item_id: number;
        number: string;
        destination_sector: string;
        destination_level: string;
        destination_block: string;
        // No se expone el DNI en la historia.
        recipient_name: string;
    };
    quantity_registered: string;
    quantity_adjusted: string;
    quantity_effective: string;
    locations: HistoryLocation[];
    adjustments: HistoryAdjustment[];
}

export type HistoryItem = HistoryEntry | HistoryExit;

export type HistorySort = "date" | "entrada_first" | "salida_first";

export interface ProductHistory {
    product: ProductSummary;
    filters: {
        bin_id: string | null; from: string | null; to: string | null;
        type: "all" | HistoryType; sort: HistorySort; direction: "asc" | "desc"; include_in_progress: boolean;
    };
    // Stock ACTUAL (no depende de fechas ni del tipo).
    stock: { total: string; by_bin: { bin_id: number; label: string; quantity: string }[] };
    // Movimientos de stock dentro de las fechas y la casilla (incluye ajustes); no depende del tipo.
    totals: { entered: string; exited: string; net: string };
    items: HistoryItem[];
    truncated: boolean;
}
