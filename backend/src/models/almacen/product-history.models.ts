// Hoja de vida del PRODUCTO del catálogo (Fase 9): su historia a lo largo del tiempo
// (cuándo se pidió, ordenó, facturó, recibió y salió), y no solo dónde está ahora.
// Todo se calcula al consultar; el almacén no maneja lotes, así que NO se atribuye
// qué unidades salieron de qué ingreso (se muestran los ingresos y los totales).
export type ProductHistoryKind = "requested" | "ordered" | "invoiced" | "received" | "issued";

export interface ProductHistoryEvent {
    kind: ProductHistoryKind;
    // Fecha del documento ("AAAA-MM-DD"): requerimiento, orden, factura, recepción o vale.
    date: string;
    document: { type: "requisition" | "purchase_order" | "invoice" | "goods_receipt" | "goods_issue"; id: number; label: string };
    quantity: string;
    // Ingresos y salidas: casilla del movimiento y saldo TOTAL del producto justo después.
    bin: { bin_id: number; label: string } | null;
    balance_after: string | null;
    // Requerimiento / orden / factura / ingreso.
    supplier: { supplier_id: number; name: string } | null;
    unit_price: string | null;
    line_total: string | null;
    currency: string | null;
    requester: string | null;
    // Ingreso: tipo de entrada y orden de la que viene (null si no cita orden).
    entry_type: "normal" | "rapida" | null;
    purchase_order: string | null;
    // Vale de salida: destino en obra y quién retiró.
    destination: string | null;
    recipient_name: string | null;
}

export interface ProductHistory {
    product: { product_id: number; code: string; name: string; unit: string };
    filters: { bin_id: number | null; from: string | null; to: string | null };
    // Stock ACTUAL (no depende de fechas). Con bin_id, solo esa casilla.
    stock: { total: string; by_bin: { bin_id: number; label: string; quantity: string }[] };
    // Movimientos de stock dentro de los filtros: entrado, salido y neto.
    totals: { entered: string; exited: string; net: string };
    // Más reciente primero. Con bin_id solo trae movimientos de stock (no compras).
    timeline: ProductHistoryEvent[];
    // true si se alcanzó el tope de eventos y la línea de tiempo quedó incompleta.
    truncated: boolean;
}
