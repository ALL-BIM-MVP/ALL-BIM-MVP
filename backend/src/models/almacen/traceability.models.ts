import type { ProductSummary } from "./product.models.js";
// Trazabilidad DOCUMENTAL (Fase 9 de docs/almacen-ingreso-productos/05-roadmap.md):
// desde cualquier documento se sigue la cadena requerimiento → cotización → orden →
// factura → ingreso por LÍNEA (por elemento). Consulta de solo lectura sobre los
// vínculos que ya existen (sin tabla "ingreso": opción B). Las cantidades y montos
// son NUMERIC: llegan como string.
export type TraceDocumentType = "requisition" | "quotation" | "purchase-order" | "invoice" | "goods-receipt";
export type TraceDirection = "backward" | "forward" | "all";

// Datos comunes de un documento del recorrido. `label` es lo que se muestra
// (número, o "serie-número" en facturas e ingresos).
export interface TraceDocument {
    id: number;
    label: string;
    // Ingreso: `date` es la de recepción (vale de entrada); `delivery_note_date`, la de la guía. Otros documentos: null.
    date: string;
    delivery_note_date: string | null;
    supplier: { supplier_id: number; ruc: string; name: string } | null;
    has_file: boolean;
    // Solo ingresos: 'normal' | 'rapida'; solo requerimientos: quién lo pidió.
    entry_type: "normal" | "rapida" | null;
    requester: string | null;
    currency: string | null;
    // Solo ingresos: anulado (Fase 10). Sus líneas efectivas quedan en cero.
    voided: boolean;
    is_anchor: boolean;
}

export interface TraceDocuments {
    requisitions: TraceDocument[];
    quotations: TraceDocument[];
    purchase_orders: TraceDocument[];
    invoices: TraceDocument[];
    goods_receipts: TraceDocument[];
}

interface TraceLineBase {
    id: number;
    // Documento al que pertenece la línea (ver `documents`).
    document_id: number;
    description: string;
}

export interface TraceRequisitionLine extends TraceLineBase { quantity_requested: string; estimated_unit_price: string | null }
export interface TraceQuotationLine extends TraceLineBase { quantity_quoted: string; unit_price: string | null; line_total: string }
export interface TraceOrderLine extends TraceLineBase { quantity_ordered: string; unit_price: string | null; line_total: string }
export interface TraceInvoiceLine extends TraceLineBase { quantity_invoiced: string; unit_price: string | null; line_total: string }
export interface TraceReceiptLine {
    id: number;
    document_id: number;
    description: string;
    // Lo registrado, los ajustes (Fase 10) y lo EFECTIVO (registrado + ajustes) = quantity_received.
    quantity_registered: string;
    quantity_adjusted: string;
    quantity_received: string;
    // Lo que decía la guía (null si no se registró).
    quantity_per_delivery_note: string | null;
    // Dónde queda efectivamente lo recibido (lo registrado más los ajustes, sin casillas en cero).
    locations: { bin_id: number; label: string; quantity: string }[];
}

// Un hilo = UN ELEMENTO con todas sus líneas encadenadas (requerimiento, ofertas,
// órdenes, facturas e ingresos con sus casillas). Un elemento sin vínculos (compra
// directa, entrada rápida) forma su propio hilo.
export interface TraceThread {
    product: ProductSummary;
    contains_anchor: boolean;
    requisition_items: TraceRequisitionLine[];
    quotation_items: TraceQuotationLine[];
    purchase_order_items: TraceOrderLine[];
    invoice_items: TraceInvoiceLine[];
    receipt_items: TraceReceiptLine[];
}

export interface Traceability {
    anchor: { type: TraceDocumentType; id: number; label: string };
    direction: TraceDirection;
    // true si se alcanzó el tope de líneas y el recorrido quedó incompleto.
    truncated: boolean;
    documents: TraceDocuments;
    threads: TraceThread[];
}
