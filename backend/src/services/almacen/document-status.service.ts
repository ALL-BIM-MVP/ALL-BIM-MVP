// Estado documental DERIVADO (Fase 8): avance por línea (pedido / ordenado /
// facturado / recibido / pendiente), adjudicación de cotizaciones, "expediente" del
// ingreso y avisos. Todo se calcula por consulta (sin columnas nuevas, no puede
// quedar desactualizado) y los avisos NUNCA bloquean (el sistema se acopla al
// proceso del cliente). Solo cuentan los documentos ACTIVOS (sin baja lógica),
// salvo los ingresos, que no se dan de baja. Lo RECIBIDO es lo efectivo: la cantidad registrada más
// los ajustes (Fase 10); un ingreso anulado queda en cero. Las sumas y comparaciones se hacen en
// SQL: las cantidades son NUMERIC y llegan como string.
import type { Pool, PoolClient } from "pg";
import type {
    MissingStage, PurchaseOrderItemProgress, QuotationItemProgress, ReceiptDocuments, RequisitionItemProgress,
    RequisitionSummary, StatusAlert,
} from "../../models/almacen/document-status.models.js";

type Db = Pick<Pool | PoolClient, "query">;

// "60.000000" -> "60" (solo para los mensajes).
const fmt = (value: string | null | undefined): string => (value == null ? "—" : String(Number(value)));
const key = (id: number | string): string => String(id);

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------
export const filePendingAlert = (): StatusAlert => ({
    code: "FILE_PENDING", message: "Falta adjuntar el archivo del documento.",
});

// Avisos de una línea de orden de compra según el contexto donde se muestra: en la
// orden interesan todos; en la factura, lo facturado; en el ingreso, lo recibido.
export type OrderItemAlertScope = "order" | "invoice" | "receipt";

interface OrderItemFlags {
    ordered: string; invoiced: string; received: string; quoted: string | null; quotation_ordered: string | null;
    excess_received: boolean; excess_invoiced: boolean; ordered_over_quoted: boolean;
    received_not_invoiced: boolean; invoiced_not_received: boolean;
}

export const orderItemAlerts = (p: OrderItemFlags, scope: OrderItemAlertScope): StatusAlert[] => {
    const alerts: StatusAlert[] = [];
    if (scope !== "invoice" && p.excess_received) {
        alerts.push({ code: "OVER_RECEIVED", message: `Se recibió más de lo ordenado (recibido ${fmt(p.received)}, ordenado ${fmt(p.ordered)}).`, details: { ordered: p.ordered, received: p.received } });
    }
    if (scope !== "receipt" && p.excess_invoiced) {
        alerts.push({ code: "OVER_INVOICED", message: `Se facturó más de lo ordenado (facturado ${fmt(p.invoiced)}, ordenado ${fmt(p.ordered)}).`, details: { ordered: p.ordered, invoiced: p.invoiced } });
    }
    if (scope === "order" && p.ordered_over_quoted) {
        alerts.push({ code: "ORDERED_OVER_QUOTED", message: `Lo ordenado supera lo cotizado (ordenado ${fmt(p.quotation_ordered)}, cotizado ${fmt(p.quoted)}).`, details: { quoted: p.quoted ?? "", ordered: p.quotation_ordered ?? "" } });
    }
    if (scope !== "invoice" && p.received_not_invoiced) {
        alerts.push({ code: "RECEIVED_NOT_INVOICED", message: `Hay material recibido sin facturar (recibido ${fmt(p.received)}, facturado ${fmt(p.invoiced)}).`, details: { received: p.received, invoiced: p.invoiced } });
    }
    if (scope !== "receipt" && p.invoiced_not_received) {
        alerts.push({ code: "INVOICED_NOT_RECEIVED", message: `Hay material facturado que aún no se recibió (facturado ${fmt(p.invoiced)}, recibido ${fmt(p.received)}).`, details: { invoiced: p.invoiced, received: p.received } });
    }
    return alerts;
};

// ---------------------------------------------------------------------------
// Línea de orden de compra
// ---------------------------------------------------------------------------
export interface OrderItemStatus {
    progress: PurchaseOrderItemProgress;
    alerts: (scope: OrderItemAlertScope) => StatusAlert[];
}

export const getPurchaseOrderItemStatus = async (
    db: Db, purchaseOrderItemIds: (number | string)[]
): Promise<Map<string, OrderItemStatus>> => {
    const result = new Map<string, OrderItemStatus>();
    if (purchaseOrderItemIds.length === 0) return result;

    const { rows } = await db.query<
        { purchase_order_item_id: string } & PurchaseOrderItemProgress & Omit<OrderItemFlags, "ordered" | "invoiced" | "received" | "quoted">
    >(
        `SELECT p.purchase_order_item_id,
            p.quantity_ordered::text AS ordered,
            COALESCE(inv.q, 0)::numeric(18,6)::text AS invoiced,
            COALESCE(rec.q, 0)::numeric(18,6)::text AS received,
            GREATEST(p.quantity_ordered - COALESCE(inv.q, 0), 0)::numeric(18,6)::text AS pending_to_invoice,
            GREATEST(p.quantity_ordered - COALESCE(rec.q, 0), 0)::numeric(18,6)::text AS pending_to_receive,
            qi.quantity_quoted::text AS quoted,
            ri.quantity_requested::text AS requested,
            qo.q::text AS quotation_ordered,
            COALESCE(rec.q, 0) > p.quantity_ordered AS excess_received,
            COALESCE(inv.q, 0) > p.quantity_ordered AS excess_invoiced,
            (qi.quantity_quoted IS NOT NULL AND COALESCE(qo.q, 0) > qi.quantity_quoted) AS ordered_over_quoted,
            COALESCE(rec.q, 0) > COALESCE(inv.q, 0) AS received_not_invoiced,
            COALESCE(inv.q, 0) > COALESCE(rec.q, 0) AS invoiced_not_received
        FROM purchase_order_items p
        LEFT JOIN LATERAL (
            SELECT SUM(ii.quantity_invoiced) AS q
            FROM invoice_items ii INNER JOIN invoices v ON v.invoice_id = ii.invoice_id AND v.deleted_at IS NULL
            WHERE ii.purchase_order_item_id = p.purchase_order_item_id
        ) inv ON true
        LEFT JOIN LATERAL (
            SELECT SUM(gri.total_quantity + COALESCE((SELECT SUM(a.quantity_delta) FROM inventory_adjustment_items a WHERE a.goods_receipt_item_id = gri.goods_receipt_item_id), 0)) AS q FROM goods_receipt_items gri
            WHERE gri.purchase_order_item_id = p.purchase_order_item_id
        ) rec ON true
        LEFT JOIN quotation_items qi ON qi.quotation_item_id = p.quotation_item_id
        LEFT JOIN purchase_requisition_items ri ON ri.purchase_requisition_item_id = p.purchase_requisition_item_id
        LEFT JOIN LATERAL (
            SELECT SUM(p2.quantity_ordered) AS q
            FROM purchase_order_items p2 INNER JOIN purchase_orders o2 ON o2.purchase_order_id = p2.purchase_order_id AND o2.deleted_at IS NULL
            WHERE p2.quotation_item_id = p.quotation_item_id
        ) qo ON true
        WHERE p.purchase_order_item_id = ANY($1::bigint[])`,
        [purchaseOrderItemIds]
    );

    for (const r of rows) {
        const flags = r as unknown as OrderItemFlags;
        result.set(key(r.purchase_order_item_id), {
            progress: {
                ordered: r.ordered, invoiced: r.invoiced, received: r.received,
                pending_to_invoice: r.pending_to_invoice, pending_to_receive: r.pending_to_receive,
                quoted: r.quoted, requested: r.requested,
            },
            alerts: (scope) => orderItemAlerts(flags, scope),
        });
    }
    return result;
};

// ---------------------------------------------------------------------------
// Línea de requerimiento
// ---------------------------------------------------------------------------
export interface RequisitionItemStatus {
    progress: RequisitionItemProgress;
    alerts: StatusAlert[];
}

export const getRequisitionItemStatus = async (
    db: Db, requisitionItemIds: (number | string)[]
): Promise<{ items: Map<string, RequisitionItemStatus>; summary: RequisitionSummary }> => {
    const items = new Map<string, RequisitionItemStatus>();
    const summary: RequisitionSummary = { lines: 0, quoted: 0, ordered: 0, invoiced: 0, received: 0, fully_received: 0 };
    if (requisitionItemIds.length === 0) return { items, summary };

    const { rows } = await db.query<{
        purchase_requisition_item_id: string; requested: string; offers_count: number; ordered: string; invoiced: string;
        received: string; pending_to_order: string; pending_to_receive: string;
        ordered_over_requested: boolean; received_over_requested: boolean; fully_received: boolean;
    }>(
        `SELECT ri.purchase_requisition_item_id,
            ri.quantity_requested::text AS requested,
            (SELECT COUNT(DISTINCT q.quotation_id)::int FROM quotation_items qi
                INNER JOIN quotations q ON q.quotation_id = qi.quotation_id AND q.deleted_at IS NULL
                WHERE qi.purchase_requisition_item_id = ri.purchase_requisition_item_id) AS offers_count,
            COALESCE(ord.q, 0)::numeric(18,6)::text AS ordered,
            COALESCE(inv.q, 0)::numeric(18,6)::text AS invoiced,
            COALESCE(rec.q, 0)::numeric(18,6)::text AS received,
            GREATEST(ri.quantity_requested - COALESCE(ord.q, 0), 0)::numeric(18,6)::text AS pending_to_order,
            GREATEST(COALESCE(ord.q, 0) - COALESCE(rec.q, 0), 0)::numeric(18,6)::text AS pending_to_receive,
            COALESCE(ord.q, 0) > ri.quantity_requested AS ordered_over_requested,
            COALESCE(rec.q, 0) > ri.quantity_requested AS received_over_requested,
            COALESCE(rec.q, 0) >= ri.quantity_requested AS fully_received
        FROM purchase_requisition_items ri
        LEFT JOIN LATERAL (
            SELECT SUM(poi.quantity_ordered) AS q FROM purchase_order_items poi
            INNER JOIN purchase_orders po ON po.purchase_order_id = poi.purchase_order_id AND po.deleted_at IS NULL
            WHERE poi.purchase_requisition_item_id = ri.purchase_requisition_item_id
        ) ord ON true
        LEFT JOIN LATERAL (
            SELECT SUM(ii.quantity_invoiced) AS q FROM invoice_items ii
            INNER JOIN invoices v ON v.invoice_id = ii.invoice_id AND v.deleted_at IS NULL
            INNER JOIN purchase_order_items poi ON poi.purchase_order_item_id = ii.purchase_order_item_id
            INNER JOIN purchase_orders po ON po.purchase_order_id = poi.purchase_order_id AND po.deleted_at IS NULL
            WHERE poi.purchase_requisition_item_id = ri.purchase_requisition_item_id
        ) inv ON true
        LEFT JOIN LATERAL (
            SELECT SUM(gri.total_quantity + COALESCE((SELECT SUM(a.quantity_delta) FROM inventory_adjustment_items a WHERE a.goods_receipt_item_id = gri.goods_receipt_item_id), 0)) AS q FROM goods_receipt_items gri
            INNER JOIN purchase_order_items poi ON poi.purchase_order_item_id = gri.purchase_order_item_id
            INNER JOIN purchase_orders po ON po.purchase_order_id = poi.purchase_order_id AND po.deleted_at IS NULL
            WHERE poi.purchase_requisition_item_id = ri.purchase_requisition_item_id
        ) rec ON true
        WHERE ri.purchase_requisition_item_id = ANY($1::bigint[])`,
        [requisitionItemIds]
    );

    for (const r of rows) {
        const missing: MissingStage[] = [];
        if (r.offers_count === 0) missing.push("quotation");
        if (Number(r.ordered) === 0) missing.push("order");
        if (Number(r.invoiced) === 0) missing.push("invoice");
        if (Number(r.received) === 0) missing.push("receipt");

        const alerts: StatusAlert[] = [];
        if (r.ordered_over_requested) {
            alerts.push({ code: "ORDERED_OVER_REQUESTED", message: `Lo ordenado supera lo pedido (ordenado ${fmt(r.ordered)}, pedido ${fmt(r.requested)}).`, details: { requested: r.requested, ordered: r.ordered } });
        }
        if (r.received_over_requested) {
            alerts.push({ code: "RECEIVED_OVER_REQUESTED", message: `Lo recibido supera lo pedido (recibido ${fmt(r.received)}, pedido ${fmt(r.requested)}).`, details: { requested: r.requested, received: r.received } });
        }

        items.set(key(r.purchase_requisition_item_id), {
            progress: {
                requested: r.requested, offers_count: r.offers_count, ordered: r.ordered, invoiced: r.invoiced,
                received: r.received, pending_to_order: r.pending_to_order, pending_to_receive: r.pending_to_receive, missing,
            },
            alerts,
        });
        summary.lines += 1;
        if (r.offers_count > 0) summary.quoted += 1;
        if (Number(r.ordered) > 0) summary.ordered += 1;
        if (Number(r.invoiced) > 0) summary.invoiced += 1;
        if (Number(r.received) > 0) summary.received += 1;
        if (r.fully_received) summary.fully_received += 1;
    }
    return { items, summary };
};

// ---------------------------------------------------------------------------
// Línea de cotización: adjudicación derivada
// ---------------------------------------------------------------------------
export interface QuotationItemStatus {
    progress: QuotationItemProgress;
    alerts: StatusAlert[];
}

export const getQuotationItemStatus = async (
    db: Db, quotationItemIds: (number | string)[]
): Promise<Map<string, QuotationItemStatus>> => {
    const result = new Map<string, QuotationItemStatus>();
    if (quotationItemIds.length === 0) return result;

    const { rows } = await db.query<{
        quotation_item_id: string; quoted: string; ordered: string; orders_count: number; pending_to_order: string; ordered_over_quoted: boolean;
    }>(
        `SELECT qi.quotation_item_id,
            qi.quantity_quoted::text AS quoted,
            COALESCE(o.q, 0)::numeric(18,6)::text AS ordered,
            COALESCE(o.n, 0)::int AS orders_count,
            GREATEST(qi.quantity_quoted - COALESCE(o.q, 0), 0)::numeric(18,6)::text AS pending_to_order,
            COALESCE(o.q, 0) > qi.quantity_quoted AS ordered_over_quoted
        FROM quotation_items qi
        LEFT JOIN LATERAL (
            SELECT SUM(poi.quantity_ordered) AS q, COUNT(DISTINCT po.purchase_order_id) AS n
            FROM purchase_order_items poi
            INNER JOIN purchase_orders po ON po.purchase_order_id = poi.purchase_order_id AND po.deleted_at IS NULL
            WHERE poi.quotation_item_id = qi.quotation_item_id
        ) o ON true
        WHERE qi.quotation_item_id = ANY($1::bigint[])`,
        [quotationItemIds]
    );
    for (const r of rows) {
        const alerts: StatusAlert[] = [];
        if (r.ordered_over_quoted) {
            alerts.push({ code: "ORDERED_OVER_QUOTED", message: `Lo ordenado supera lo cotizado (ordenado ${fmt(r.ordered)}, cotizado ${fmt(r.quoted)}).`, details: { quoted: r.quoted, ordered: r.ordered } });
        }
        result.set(key(r.quotation_item_id), {
            progress: { quoted: r.quoted, ordered: r.ordered, orders_count: r.orders_count, awarded: r.orders_count > 0, pending_to_order: r.pending_to_order },
            alerts,
        });
    }
    return result;
};

// ---------------------------------------------------------------------------
// Expediente del ingreso
// ---------------------------------------------------------------------------
export interface ReceiptStatus {
    documents: ReceiptDocuments;
    alerts: StatusAlert[];
}

export const getReceiptStatus = async (
    db: Db, goodsReceiptIds: (number | string)[]
): Promise<Map<string, ReceiptStatus>> => {
    const result = new Map<string, ReceiptStatus>();
    if (goodsReceiptIds.length === 0) return result;

    const { rows } = await db.query<{
        goods_receipt_id: string; entry_type: "normal" | "rapida"; has_order: boolean; has_file: boolean; voided: boolean;
        order_has_requisition: boolean; order_has_quotation: boolean; has_invoice: boolean;
    }>(
        `SELECT gr.goods_receipt_id, gr.entry_type,
            gr.purchase_order_id IS NOT NULL AS has_order,
            gr.file_id IS NOT NULL AS has_file,
            gr.voided_at IS NOT NULL AS voided,
            COALESCE(o.purchase_requisition_id IS NOT NULL, false) AS order_has_requisition,
            COALESCE(o.quotation_id IS NOT NULL, false) AS order_has_quotation,
            EXISTS (
                SELECT 1 FROM goods_receipt_items gri
                INNER JOIN invoice_items ii ON ii.purchase_order_item_id = gri.purchase_order_item_id
                INNER JOIN invoices v ON v.invoice_id = ii.invoice_id AND v.deleted_at IS NULL
                WHERE gri.goods_receipt_id = gr.goods_receipt_id
            ) AS has_invoice
        FROM goods_receipts gr
        LEFT JOIN purchase_orders o ON o.purchase_order_id = gr.purchase_order_id
        WHERE gr.goods_receipt_id = ANY($1::bigint[])`,
        [goodsReceiptIds]
    );

    for (const r of rows) {
        const alerts: StatusAlert[] = [];
        let documents: ReceiptDocuments;
        if (r.entry_type === "rapida") {
            // Entrada rápida: los pasos anteriores simplemente no existen para este ingreso.
            documents = { requisition: "no_aplica", quotation: "no_aplica", purchase_order: "no_aplica", invoice: "no_aplica", delivery_note_file: r.has_file ? "presente" : "pendiente" };
        } else {
            // Normal: sin orden vinculada todo lo anterior está pendiente ("falta registrar" no es "no hay").
            // Con orden: requerimiento/cotización son "no_aplica" si esa orden declara que no vino de ellos (compra directa).
            documents = {
                purchase_order: r.has_order ? "presente" : "pendiente",
                requisition: !r.has_order ? "pendiente" : r.order_has_requisition ? "presente" : "no_aplica",
                quotation: !r.has_order ? "pendiente" : r.order_has_quotation ? "presente" : "no_aplica",
                invoice: r.has_invoice ? "presente" : "pendiente",
                delivery_note_file: r.has_file ? "presente" : "pendiente",
            };
            if (!r.has_order) alerts.push({ code: "ORDER_PENDING", message: "Falta vincular la orden de compra de este ingreso." });
            if (!r.has_invoice) alerts.push({ code: "INVOICE_PENDING", message: "Falta registrar la factura de este ingreso." });
        }
        if (!r.has_file) alerts.push(filePendingAlert());
        // Un ingreso anulado ya no espera documentos: no genera avisos pendientes.
        result.set(key(r.goods_receipt_id), { documents, alerts: r.voided ? [] : alerts });
    }
    return result;
};
