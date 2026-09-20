// Estado documental DERIVADO (Fase 8 de docs/almacen-ingreso-productos/05-roadmap.md):
// se calcula al consultar, nunca se guarda. Las cantidades son NUMERIC: llegan como
// string desde pg (el backend no las suma con `+`; las sumas y comparaciones se
// hacen en SQL).

// Aviso informativo: nunca bloquea. `code` es estable (para el frontend); `message`
// va en español neutro; `details` trae las cifras.
export interface StatusAlert {
    code:
        | "OVER_RECEIVED" | "OVER_INVOICED" | "ORDERED_OVER_QUOTED" | "ORDERED_OVER_REQUESTED"
        | "RECEIVED_OVER_REQUESTED" | "RECEIVED_NOT_INVOICED" | "INVOICED_NOT_RECEIVED"
        | "FILE_PENDING" | "ORDER_PENDING" | "INVOICE_PENDING";
    message: string;
    details?: Record<string, string>;
}

// Etapas de la cadena donde una línea de requerimiento todavía no aparece.
export type MissingStage = "quotation" | "order" | "invoice" | "receipt";

export interface RequisitionItemProgress {
    requested: string;
    // Cuántas cotizaciones activas cubren la línea. Las cantidades cotizadas son
    // alternativas de distintos proveedores: NO se suman.
    offers_count: number;
    ordered: string;
    invoiced: string;
    received: string;
    pending_to_order: string;
    pending_to_receive: string;
    missing: MissingStage[];
}

export interface RequisitionSummary {
    lines: number;
    quoted: number;
    ordered: number;
    invoiced: number;
    received: number;
    // Líneas cuyo total recibido ya alcanza lo pedido.
    fully_received: number;
}

export interface QuotationItemProgress {
    quoted: string;
    ordered: string;
    orders_count: number;
    // Adjudicada = alguna línea de orden activa la cita (no hay estado guardado).
    awarded: boolean;
    pending_to_order: string;
}

// Avance de una línea de orden de compra (acumulado de TODOS sus documentos).
export interface PurchaseOrderItemProgress {
    ordered: string;
    invoiced: string;
    received: string;
    pending_to_invoice: string;
    pending_to_receive: string;
    // null si la línea no cita una línea de cotización / de requerimiento.
    quoted: string | null;
    requested: string | null;
}

export type DocumentStep = "presente" | "pendiente" | "no_aplica";

// "Expediente" del ingreso: qué documentos tiene su cadena. `no_aplica` solo cuando el
// proceso no lo exige (entrada rápida, compra directa); `pendiente` = falta registrarlo.
export interface ReceiptDocuments {
    requisition: DocumentStep;
    quotation: DocumentStep;
    purchase_order: DocumentStep;
    invoice: DocumentStep;
    delivery_note_file: DocumentStep;
}
