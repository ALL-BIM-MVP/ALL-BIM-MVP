// Hoja de vida del PRODUCTO del catálogo: su historia a lo largo del tiempo, en dos procesos:
//  - ENTRADAS: cada ingreso se despliega en los documentos de su cadena (requerimiento, cotización,
//    orden, factura y la guía con su vale de entrada). Lo que aún no llegó (hay documentos previos
//    pero ninguna guía) aparece como entrada "en_curso".
//  - SALIDAS: cada vale es un solo documento con sus datos.
// Los ajustes van dentro del ingreso o del vale que corrigen. Todo en una lista con `type`; el
// backend filtra (fechas, tipo, casilla) y ordena (mezclado por fecha o agrupado por tipo), y el
// frontend puede reagrupar. Solo lectura, todo se calcula al consultar.
//
// El almacén NO maneja lotes: no se atribuye qué unidades salieron de qué ingreso. Las salidas y
// las entradas se listan por separado y los totales resumen entrado / salido / actual.
//
// Cuando un pedido llega en varias guías, cada ingreso repite sus documentos de origen (así cada
// ingreso se lee completo por sí solo).
import pool from "../../db/database.js";
import { AppError } from "../../models/errors/app-error.js";
import { PRODUCT_ERRORS } from "../../models/errors/almacen/product.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { assertBinInProject } from "./bin.service.js";
import type { ProductHistoryParam, ProductHistoryQuery } from "../../schemas/almacen/product-history.schema.js";
import type {
    HistoryAdjustment, HistoryDocumentLine, HistoryDocuments, HistoryEntry, HistoryExit, HistoryItem, HistoryLocation, ProductHistory,
} from "../../models/almacen/product-history.models.js";
import { addNumeric, negateNumeric } from "../../utils/numeric-text.js";

// Tope de elementos por origen: evita respuestas gigantes (se avisa con `truncated`).
export const HISTORY_MAX_EVENTS = 1000;

type Row = Record<string, unknown>;
type Q = Pick<typeof pool, "query">;

const BIN_LABEL = `w.name || ' · ' || r.name || ' · ' || b.location_label`;
const BIN_JOINS = `INNER JOIN bins b ON b.bin_id = %BIN%
    INNER JOIN racks r ON r.rack_id = b.rack_id
    INNER JOIN warehouses w ON w.warehouse_id = r.warehouse_id`;
const binJoins = (column: string) => BIN_JOINS.replace("%BIN%", column);

const NUM = (column: string) => `${column}::numeric(18,6)::text`;
const str = (v: unknown) => String(v);
const nullableStr = (v: unknown) => (v == null ? null : String(v));
const ids = (list: Iterable<unknown>): string[] => [...new Set([...list].filter((v) => v != null).map(String))];

const emptyDocuments = (): HistoryDocuments => ({ requisitions: [], quotations: [], purchase_orders: [], invoices: [] });

// ---- documentos previos (cadena de una línea de orden o de requerimiento) -------------------------
interface Chain {
    orderLines: Map<string, Row>;
    quotationLines: Map<string, Row>;
    requisitionLines: Map<string, Row>;
    invoicesByOrderLine: Map<string, Row[]>;
    quotationsByRequisitionLine: Map<string, Row[]>;
}

const supplierOf = (r: Row) => (r.supplier_id == null ? null : { supplier_id: r.supplier_id as number, ruc: str(r.supplier_ruc), name: str(r.supplier_name) });

const requisitionLine = (r: Row): HistoryDocumentLine => ({
    document_id: r.document_id as number, item_id: r.item_id as number, label: str(r.label), date: str(r.date), description: str(r.description),
    quantity: str(r.quantity), unit_price: nullableStr(r.unit_price), line_total: null, currency: null, supplier: null, requester: nullableStr(r.requester),
});
const pricedLine = (r: Row): HistoryDocumentLine => ({
    document_id: r.document_id as number, item_id: r.item_id as number, label: str(r.label), date: str(r.date), description: str(r.description),
    quantity: str(r.quantity), unit_price: nullableStr(r.unit_price), line_total: nullableStr(r.line_total), currency: nullableStr(r.currency),
    supplier: supplierOf(r), requester: null,
});

// Carga, en pocas consultas, los documentos que rodean a las líneas de orden y de requerimiento pedidas.
const loadChain = async (
    q: Q, productId: number, orderLineIds: string[], requisitionLineIds: string[]
): Promise<Chain> => {
    const orderLines = new Map<string, Row>();
    const quotationLines = new Map<string, Row>();
    const requisitionLines = new Map<string, Row>();
    const invoicesByOrderLine = new Map<string, Row[]>();
    const quotationsByRequisitionLine = new Map<string, Row[]>();

    if (orderLineIds.length > 0) {
        const { rows } = await q.query<Row>(
            `SELECT i.purchase_order_item_id AS item_id, d.purchase_order_id AS document_id, d.number AS label, to_char(d.order_date, 'YYYY-MM-DD') AS date,
                d.currency, s.supplier_id, s.ruc AS supplier_ruc, s.name AS supplier_name, i.description, ${NUM("i.quantity_ordered")} AS quantity,
                ${NUM("i.unit_price")} AS unit_price, ${NUM("i.line_total")} AS line_total, i.quotation_item_id AS qid, i.purchase_requisition_item_id AS rid
            FROM purchase_order_items i INNER JOIN purchase_orders d ON d.purchase_order_id = i.purchase_order_id
            INNER JOIN suppliers s ON s.supplier_id = d.supplier_id
            WHERE i.purchase_order_item_id = ANY($1::bigint[]) AND d.deleted_at IS NULL`, [orderLineIds]);
        for (const r of rows) orderLines.set(str(r.item_id), r);

        const invoices = await q.query<Row>(
            `SELECT i.invoice_item_id AS item_id, d.invoice_id AS document_id, concat(d.series, '-', d.number) AS label, to_char(d.invoice_date, 'YYYY-MM-DD') AS date,
                d.currency, s.supplier_id, s.ruc AS supplier_ruc, s.name AS supplier_name, i.description, ${NUM("i.quantity_invoiced")} AS quantity,
                ${NUM("i.unit_price")} AS unit_price, ${NUM("i.line_total")} AS line_total, i.purchase_order_item_id AS poi
            FROM invoice_items i INNER JOIN invoices d ON d.invoice_id = i.invoice_id INNER JOIN suppliers s ON s.supplier_id = d.supplier_id
            WHERE i.purchase_order_item_id = ANY($1::bigint[]) AND d.deleted_at IS NULL
            ORDER BY d.invoice_date, i.invoice_item_id`, [orderLineIds]);
        for (const r of invoices.rows) {
            const key = str(r.poi);
            invoicesByOrderLine.set(key, [...(invoicesByOrderLine.get(key) ?? []), r]);
        }
    }

    const quotationIds = ids([...orderLines.values()].map((o) => o.qid));
    const requisitionIdsFromOrders = ids([...orderLines.values()].map((o) => o.rid));
    if (quotationIds.length > 0) {
        const { rows } = await q.query<Row>(
            `SELECT i.quotation_item_id AS item_id, d.quotation_id AS document_id, d.number AS label, to_char(d.quotation_date, 'YYYY-MM-DD') AS date,
                d.currency, s.supplier_id, s.ruc AS supplier_ruc, s.name AS supplier_name, i.description, ${NUM("i.quantity_quoted")} AS quantity,
                ${NUM("i.unit_price")} AS unit_price, ${NUM("i.line_total")} AS line_total, i.purchase_requisition_item_id AS rid
            FROM quotation_items i INNER JOIN quotations d ON d.quotation_id = i.quotation_id INNER JOIN suppliers s ON s.supplier_id = d.supplier_id
            WHERE i.quotation_item_id = ANY($1::bigint[]) AND d.deleted_at IS NULL`, [quotationIds]);
        for (const r of rows) quotationLines.set(str(r.item_id), r);
    }

    if (requisitionLineIds.length > 0) {
        // Ofertas (todas las cotizaciones) de las líneas de requerimiento "en curso".
        const { rows } = await q.query<Row>(
            `SELECT i.quotation_item_id AS item_id, d.quotation_id AS document_id, d.number AS label, to_char(d.quotation_date, 'YYYY-MM-DD') AS date,
                d.currency, s.supplier_id, s.ruc AS supplier_ruc, s.name AS supplier_name, i.description, ${NUM("i.quantity_quoted")} AS quantity,
                ${NUM("i.unit_price")} AS unit_price, ${NUM("i.line_total")} AS line_total, i.purchase_requisition_item_id AS rid
            FROM quotation_items i INNER JOIN quotations d ON d.quotation_id = i.quotation_id INNER JOIN suppliers s ON s.supplier_id = d.supplier_id
            WHERE i.purchase_requisition_item_id = ANY($1::bigint[]) AND d.deleted_at IS NULL
            ORDER BY d.quotation_date, i.quotation_item_id`, [requisitionLineIds]);
        for (const r of rows) {
            const key = str(r.rid);
            quotationsByRequisitionLine.set(key, [...(quotationsByRequisitionLine.get(key) ?? []), r]);
        }
    }

    const requisitionIds = ids([
        ...requisitionIdsFromOrders, ...requisitionLineIds,
        ...[...quotationLines.values()].map((qi) => qi.rid),
    ]);
    if (requisitionIds.length > 0) {
        const { rows } = await q.query<Row>(
            `SELECT i.purchase_requisition_item_id AS item_id, d.purchase_requisition_id AS document_id, d.number AS label,
                to_char(d.requisition_date, 'YYYY-MM-DD') AS date, d.requester, i.description, ${NUM("i.quantity_requested")} AS quantity,
                ${NUM("i.estimated_unit_price")} AS unit_price
            FROM purchase_requisition_items i INNER JOIN purchase_requisitions d ON d.purchase_requisition_id = i.purchase_requisition_id
            WHERE i.purchase_requisition_item_id = ANY($1::bigint[]) AND d.deleted_at IS NULL AND i.product_id = $2`, [requisitionIds, productId]);
        for (const r of rows) requisitionLines.set(str(r.item_id), r);
    }
    return { orderLines, quotationLines, requisitionLines, invoicesByOrderLine, quotationsByRequisitionLine };
};

// Documentos de la cadena de UNA línea de orden (la que cita el ingreso o la que está en curso).
const documentsOfOrderLine = (chain: Chain, orderLineId: string | null): HistoryDocuments => {
    const docs = emptyDocuments();
    const order = orderLineId == null ? undefined : chain.orderLines.get(orderLineId);
    if (!order) return docs;
    docs.purchase_orders.push(pricedLine(order));
    const quotation = order.qid == null ? undefined : chain.quotationLines.get(str(order.qid));
    if (quotation) docs.quotations.push(pricedLine(quotation));
    const requisitionId = order.rid ?? quotation?.rid;
    const requisition = requisitionId == null ? undefined : chain.requisitionLines.get(str(requisitionId));
    if (requisition) docs.requisitions.push(requisitionLine(requisition));
    for (const invoice of chain.invoicesByOrderLine.get(str(orderLineId)) ?? []) docs.invoices.push(pricedLine(invoice));
    return docs;
};

const documentsOfRequisitionLine = (chain: Chain, requisitionLineId: string): HistoryDocuments => {
    const docs = emptyDocuments();
    const requisition = chain.requisitionLines.get(requisitionLineId);
    if (requisition) docs.requisitions.push(requisitionLine(requisition));
    for (const offer of chain.quotationsByRequisitionLine.get(requisitionLineId) ?? []) docs.quotations.push(pricedLine(offer));
    return docs;
};

const latestDate = (docs: HistoryDocuments): string =>
    [...docs.requisitions, ...docs.quotations, ...docs.purchase_orders, ...docs.invoices].map((d) => d.date).sort().pop() ?? "";

// ---- ubicaciones y ajustes de una línea de ingreso o de vale ------------------------------------
const loadLocations = async (
    q: Q, kind: "receipt" | "issue", productId: number, lineIds: string[], binId: number | null
): Promise<Map<string, HistoryLocation[]>> => {
    const isReceipt = kind === "receipt";
    const { rows } = await q.query<Row>(
        isReceipt
            ? `SELECT l.goods_receipt_item_id AS item_id, l.bin_id, ${BIN_LABEL} AS label, ${NUM("l.quantity")} AS quantity,
                    (SELECT ${NUM("m.resulting_balance")} FROM inventory_movements m WHERE m.reference_document_type = 'goods_receipt'
                        AND m.reference_document_id = gri.goods_receipt_id AND m.bin_id = l.bin_id AND m.product_id = $2 ORDER BY m.inventory_movement_id LIMIT 1) AS balance
                FROM goods_receipt_item_locations l INNER JOIN goods_receipt_items gri ON gri.goods_receipt_item_id = l.goods_receipt_item_id
                ${binJoins("l.bin_id")}
                WHERE l.goods_receipt_item_id = ANY($1::bigint[]) AND ($3::bigint IS NULL OR l.bin_id = $3)
                ORDER BY l.goods_receipt_item_location_id`
            : `SELECT l.goods_issue_item_id AS item_id, l.bin_id, ${BIN_LABEL} AS label, ${NUM("l.quantity")} AS quantity,
                    (SELECT ${NUM("m.resulting_balance")} FROM inventory_movements m WHERE m.reference_document_type = 'goods_issue'
                        AND m.reference_document_id = gii.goods_issue_id AND m.bin_id = l.bin_id AND m.product_id = $2 ORDER BY m.inventory_movement_id LIMIT 1) AS balance
                FROM goods_issue_item_locations l INNER JOIN goods_issue_items gii ON gii.goods_issue_item_id = l.goods_issue_item_id
                ${binJoins("l.bin_id")}
                WHERE l.goods_issue_item_id = ANY($1::bigint[]) AND ($3::bigint IS NULL OR l.bin_id = $3)
                ORDER BY l.goods_issue_item_location_id`,
        [lineIds, productId, binId]
    );
    const byLine = new Map<string, HistoryLocation[]>();
    for (const r of rows) {
        const key = str(r.item_id);
        byLine.set(key, [...(byLine.get(key) ?? []), { bin_id: r.bin_id as number, label: str(r.label), quantity: str(r.quantity), balance_after: nullableStr(r.balance) }]);
    }
    return byLine;
};

interface AdjustmentsOfLines { byLine: Map<string, HistoryAdjustment[]>; deltaByLine: Map<string, string> }

const loadAdjustments = async (
    q: Q, kind: "receipt" | "issue", productId: number, lineIds: string[], binId: number | null
): Promise<AdjustmentsOfLines> => {
    const lineColumn = kind === "receipt" ? "ai.goods_receipt_item_id" : "ai.goods_issue_item_id";
    const { rows } = await q.query<Row>(
        `SELECT ${lineColumn} AS item_id, ia.inventory_adjustment_id, ia.kind, ia.reason, to_char(ia.adjustment_date, 'YYYY-MM-DD') AS date,
            ai.bin_id, ${BIN_LABEL} AS label, ${NUM("ai.quantity_delta")} AS delta,
            (SELECT CASE WHEN m.type = 'entrada' THEN ${NUM("m.quantity")} ELSE ${NUM("(-m.quantity)")} END FROM inventory_movements m
                WHERE m.reference_document_type = 'inventory_adjustment' AND m.reference_document_id = ia.inventory_adjustment_id
                    AND m.bin_id = ai.bin_id AND m.product_id = $2 ORDER BY m.inventory_movement_id LIMIT 1) AS stock_effect,
            (SELECT ${NUM("m.resulting_balance")} FROM inventory_movements m
                WHERE m.reference_document_type = 'inventory_adjustment' AND m.reference_document_id = ia.inventory_adjustment_id
                    AND m.bin_id = ai.bin_id AND m.product_id = $2 ORDER BY m.inventory_movement_id LIMIT 1) AS balance
        FROM inventory_adjustment_items ai INNER JOIN inventory_adjustments ia ON ia.inventory_adjustment_id = ai.inventory_adjustment_id
        ${binJoins("ai.bin_id")}
        WHERE ${lineColumn} = ANY($1::bigint[]) AND ($3::bigint IS NULL OR ai.bin_id = $3)
        ORDER BY ia.inventory_adjustment_id, ai.inventory_adjustment_item_id`,
        [lineIds, productId, binId]
    );
    const byLine = new Map<string, HistoryAdjustment[]>();
    const deltaByLine = new Map<string, string>();
    for (const r of rows) {
        const key = str(r.item_id);
        const list = byLine.get(key) ?? [];
        let adjustment = list.find((a) => a.inventory_adjustment_id === r.inventory_adjustment_id);
        if (!adjustment) {
            adjustment = {
                inventory_adjustment_id: r.inventory_adjustment_id as number, kind: r.kind as "correccion" | "anulacion",
                label: `Ajuste #${r.inventory_adjustment_id}`, reason: str(r.reason), date: str(r.date), items: [],
            };
            list.push(adjustment);
            byLine.set(key, list);
        }
        const stockEffect = r.stock_effect == null ? (kind === "receipt" ? str(r.delta) : negateNumeric(str(r.delta))) : str(r.stock_effect);
        adjustment.items.push({ bin_id: r.bin_id as number, label: str(r.label), quantity_delta: str(r.delta), stock_effect: stockEffect, balance_after: nullableStr(r.balance) });
        deltaByLine.set(key, addNumeric(deltaByLine.get(key) ?? "0", str(r.delta)));
    }
    return { byLine, deltaByLine };
};

const sumLocations = (locations: HistoryLocation[]): string => locations.reduce((sum, l) => addNumeric(sum, l.quantity), "0.000000");

// ---- entradas ----------------------------------------------------------------------------------
const loadEntries = async (
    q: Q, projectId: number, productId: number, binId: number | null, from: string | null, to: string | null, includeInProgress: boolean
): Promise<{ items: HistoryEntry[]; truncated: boolean }> => {
    const receiptRows = await q.query<Row>(
        `SELECT gri.goods_receipt_item_id AS line_id, gri.goods_receipt_id, gri.purchase_order_item_id AS poi, gri.description,
            ${NUM("gri.quantity_per_delivery_note")} AS per_note, concat(gr.delivery_note_series, '-', gr.delivery_note_number) AS label,
            to_char(gr.delivery_note_date, 'YYYY-MM-DD') AS delivery_note_date, to_char(gr.received_date, 'YYYY-MM-DD') AS received_date,
            gr.entry_type, gr.voided_at IS NOT NULL AS voided, gr.file_id IS NOT NULL AS has_file,
            s.supplier_id, s.ruc AS supplier_ruc, s.name AS supplier_name
        FROM goods_receipt_items gri INNER JOIN goods_receipts gr ON gr.goods_receipt_id = gri.goods_receipt_id
        INNER JOIN suppliers s ON s.supplier_id = gr.supplier_id
        WHERE gri.product_id = $1 AND gr.project_id = $2
            AND ($3::date IS NULL OR gr.received_date >= $3::date) AND ($4::date IS NULL OR gr.received_date <= $4::date)
            AND ($5::bigint IS NULL
                OR EXISTS (SELECT 1 FROM goods_receipt_item_locations l WHERE l.goods_receipt_item_id = gri.goods_receipt_item_id AND l.bin_id = $5)
                OR EXISTS (SELECT 1 FROM inventory_adjustment_items a WHERE a.goods_receipt_item_id = gri.goods_receipt_item_id AND a.bin_id = $5))
        ORDER BY gr.received_date DESC, gri.goods_receipt_item_id DESC LIMIT ${HISTORY_MAX_EVENTS + 1}`,
        [productId, projectId, from, to, binId]
    );
    let truncated = receiptRows.rows.length > HISTORY_MAX_EVENTS;
    const receipts = receiptRows.rows.slice(0, HISTORY_MAX_EVENTS);

    // Entradas "en curso": hay documentos previos, pero ninguna guía vigente cita la línea de orden
    // (o, si solo hay requerimiento, ninguna orden lo cita). No aplica al filtrar por casilla.
    let pendingOrders: Row[] = [];
    let pendingRequisitions: Row[] = [];
    if (includeInProgress && binId === null) {
        const dateFilter = (column: string) => `($3::date IS NULL OR ${column} >= $3::date) AND ($4::date IS NULL OR ${column} <= $4::date)`;
        pendingOrders = (await q.query<Row>(
            `SELECT i.purchase_order_item_id AS id FROM purchase_order_items i INNER JOIN purchase_orders d ON d.purchase_order_id = i.purchase_order_id
            WHERE i.product_id = $1 AND d.project_id = $2 AND d.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM goods_receipt_items gri INNER JOIN goods_receipts gr ON gr.goods_receipt_id = gri.goods_receipt_id
                    WHERE gri.purchase_order_item_id = i.purchase_order_item_id AND gr.voided_at IS NULL)
                AND ${dateFilter("d.order_date")}
            ORDER BY d.order_date DESC, i.purchase_order_item_id DESC LIMIT ${HISTORY_MAX_EVENTS + 1}`, [productId, projectId, from, to])).rows;
        pendingRequisitions = (await q.query<Row>(
            `SELECT i.purchase_requisition_item_id AS id FROM purchase_requisition_items i
            INNER JOIN purchase_requisitions d ON d.purchase_requisition_id = i.purchase_requisition_id
            WHERE i.product_id = $1 AND d.project_id = $2 AND d.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM purchase_order_items o INNER JOIN purchase_orders od ON od.purchase_order_id = o.purchase_order_id
                    WHERE od.deleted_at IS NULL AND (o.purchase_requisition_item_id = i.purchase_requisition_item_id
                        OR o.quotation_item_id IN (SELECT quotation_item_id FROM quotation_items WHERE purchase_requisition_item_id = i.purchase_requisition_item_id)))
                AND ${dateFilter("d.requisition_date")}
            ORDER BY d.requisition_date DESC, i.purchase_requisition_item_id DESC LIMIT ${HISTORY_MAX_EVENTS + 1}`, [productId, projectId, from, to])).rows;
        truncated = truncated || pendingOrders.length > HISTORY_MAX_EVENTS || pendingRequisitions.length > HISTORY_MAX_EVENTS;
        pendingOrders = pendingOrders.slice(0, HISTORY_MAX_EVENTS);
        pendingRequisitions = pendingRequisitions.slice(0, HISTORY_MAX_EVENTS);
    }

    const lineIds = receipts.map((r) => str(r.line_id));
    const orderLineIds = ids([...receipts.map((r) => r.poi), ...pendingOrders.map((r) => r.id)]);
    const requisitionLineIds = pendingRequisitions.map((r) => str(r.id));
    const [chain, locations, adjustments] = await Promise.all([
        loadChain(q, productId, orderLineIds, requisitionLineIds),
        loadLocations(q, "receipt", productId, lineIds, binId),
        loadAdjustments(q, "receipt", productId, lineIds, binId),
    ]);

    const items: HistoryEntry[] = receipts.map((r) => {
        const key = str(r.line_id);
        const locs = locations.get(key) ?? [];
        const registered = sumLocations(locs);
        const adjusted = adjustments.deltaByLine.get(key) ?? "0.000000";
        return {
            type: "entrada", status: "recibido", date: str(r.received_date), label: str(r.label), voided: Boolean(r.voided),
            receipt: {
                goods_receipt_id: r.goods_receipt_id as number, goods_receipt_item_id: r.line_id as number, label: str(r.label),
                delivery_note_date: str(r.delivery_note_date), received_date: str(r.received_date), entry_type: r.entry_type as "normal" | "rapida",
                supplier: { supplier_id: r.supplier_id as number, ruc: str(r.supplier_ruc), name: str(r.supplier_name) },
                has_file: Boolean(r.has_file), description: str(r.description), quantity_per_delivery_note: nullableStr(r.per_note),
            },
            quantity_registered: registered, quantity_adjusted: adjusted, quantity_effective: addNumeric(registered, adjusted),
            locations: locs, documents: documentsOfOrderLine(chain, r.poi == null ? null : str(r.poi)), adjustments: adjustments.byLine.get(key) ?? [],
        };
    });

    const inProgress = (documents: HistoryDocuments): HistoryEntry => {
        const date = latestDate(documents);
        const first = documents.purchase_orders[0] ?? documents.quotations[0] ?? documents.requisitions[0];
        return {
            type: "entrada", status: "en_curso", date, label: first?.label ?? "", voided: false, receipt: null,
            quantity_registered: null, quantity_adjusted: null, quantity_effective: null, locations: [], documents, adjustments: [],
        };
    };
    for (const p of pendingOrders) {
        const documents = documentsOfOrderLine(chain, str(p.id));
        if (documents.purchase_orders.length > 0) items.push(inProgress(documents));
    }
    for (const p of pendingRequisitions) {
        const documents = documentsOfRequisitionLine(chain, str(p.id));
        if (documents.requisitions.length > 0) items.push(inProgress(documents));
    }
    return { items, truncated };
};

// ---- salidas -----------------------------------------------------------------------------------
const loadExits = async (
    q: Q, projectId: number, productId: number, binId: number | null, from: string | null, to: string | null
): Promise<{ items: HistoryExit[]; truncated: boolean }> => {
    const issueRows = await q.query<Row>(
        `SELECT gii.goods_issue_item_id AS line_id, gi.goods_issue_id, gi.number, to_char(gi.issue_date, 'YYYY-MM-DD') AS issue_date,
            gi.destination_sector, gi.destination_level, gi.destination_block, gi.recipient_name, gi.voided_at IS NOT NULL AS voided
        FROM goods_issue_items gii INNER JOIN goods_issues gi ON gi.goods_issue_id = gii.goods_issue_id
        WHERE gii.product_id = $1 AND gi.project_id = $2
            AND ($3::date IS NULL OR gi.issue_date >= $3::date) AND ($4::date IS NULL OR gi.issue_date <= $4::date)
            AND ($5::bigint IS NULL
                OR EXISTS (SELECT 1 FROM goods_issue_item_locations l WHERE l.goods_issue_item_id = gii.goods_issue_item_id AND l.bin_id = $5)
                OR EXISTS (SELECT 1 FROM inventory_adjustment_items a WHERE a.goods_issue_item_id = gii.goods_issue_item_id AND a.bin_id = $5))
        ORDER BY gi.issue_date DESC, gii.goods_issue_item_id DESC LIMIT ${HISTORY_MAX_EVENTS + 1}`,
        [productId, projectId, from, to, binId]
    );
    const truncated = issueRows.rows.length > HISTORY_MAX_EVENTS;
    const rows = issueRows.rows.slice(0, HISTORY_MAX_EVENTS);
    const lineIds = rows.map((r) => str(r.line_id));
    const [locations, adjustments] = await Promise.all([
        loadLocations(q, "issue", productId, lineIds, binId),
        loadAdjustments(q, "issue", productId, lineIds, binId),
    ]);
    const items: HistoryExit[] = rows.map((r) => {
        const key = str(r.line_id);
        const locs = locations.get(key) ?? [];
        const registered = sumLocations(locs);
        const adjusted = adjustments.deltaByLine.get(key) ?? "0.000000";
        return {
            type: "salida", date: str(r.issue_date), label: str(r.number), voided: Boolean(r.voided),
            issue: {
                goods_issue_id: r.goods_issue_id as number, goods_issue_item_id: r.line_id as number, number: str(r.number),
                destination_sector: str(r.destination_sector), destination_level: str(r.destination_level),
                destination_block: str(r.destination_block), recipient_name: str(r.recipient_name),
            },
            quantity_registered: registered, quantity_adjusted: adjusted, quantity_effective: addNumeric(registered, adjusted),
            locations: locs, adjustments: adjustments.byLine.get(key) ?? [],
        };
    });
    return { items, truncated };
};

// Orden final: por fecha (mezclado) o agrupado por tipo; dentro de cada grupo, por fecha.
export const sortHistoryItems = <T extends { type: "entrada" | "salida"; date: string }>(
    items: T[], sort: "date" | "entrada_first" | "salida_first", direction: "asc" | "desc"
): T[] => {
    const sign = direction === "asc" ? 1 : -1;
    const typeRank = (t: T) => (sort === "date" ? 0 : (t.type === (sort === "entrada_first" ? "entrada" : "salida") ? 0 : 1));
    // Array.prototype.sort es estable: a igual fecha se conserva el orden de carga (más reciente primero).
    return [...items].sort((a, b) => typeRank(a) - typeRank(b) || sign * (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
};

export const getProductHistoryService = async (
    user: DecodedToken, { projectId, productId }: ProductHistoryParam, query: Partial<ProductHistoryQuery>
): Promise<ProductHistory> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    // Se permite ver la historia de un producto ya dado de baja (su historia existe).
    const productResult = await pool.query<ProductHistory["product"]>(
        `SELECT product_id, category_id, code, display_id, name, unit FROM products WHERE product_id = $1 AND project_id = $2`, [productId, projectId]
    );
    const product = productResult.rows[0];
    if (!product) throw new AppError(PRODUCT_ERRORS.PRODUCT_NOT_FOUND);

    const binId = query.bin_id ?? null;
    const from = query.from ?? null;
    const to = query.to ?? null;
    const type = query.type ?? "all";
    const sort = query.sort ?? "date";
    const direction = query.direction ?? "desc";
    const includeInProgress = query.include_in_progress ?? true;
    if (binId !== null) await assertBinInProject(pool, projectId, binId);

    // ---- stock ACTUAL (no depende de fechas) ------------------------------------------------
    const stockRows = await pool.query<{ bin_id: number; label: string; quantity: string }>(
        `SELECT bc.bin_id, ${BIN_LABEL} AS label, bc.quantity::numeric(18,6)::text AS quantity
        FROM bin_contents bc ${binJoins("bc.bin_id")}
        WHERE bc.product_id = $1 AND ($2::bigint IS NULL OR bc.bin_id = $2) AND bc.quantity > 0
        ORDER BY bc.quantity DESC, bc.bin_id`,
        [productId, binId]
    );
    const stockTotal = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(quantity), 0)::numeric(18,6)::text AS total FROM bin_contents
        WHERE product_id = $1 AND ($2::bigint IS NULL OR bin_id = $2)`,
        [productId, binId]
    );

    // ---- totales de movimientos de stock dentro de las fechas y la casilla (incluye ajustes) ---
    const totals = await pool.query<{ entered: string; exited: string; net: string }>(
        `SELECT COALESCE(SUM(im.quantity) FILTER (WHERE im.type = 'entrada'), 0)::numeric(18,6)::text AS entered,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.type = 'salida'), 0)::numeric(18,6)::text AS exited,
            (COALESCE(SUM(im.quantity) FILTER (WHERE im.type = 'entrada'), 0)
                - COALESCE(SUM(im.quantity) FILTER (WHERE im.type = 'salida'), 0))::numeric(18,6)::text AS net
        FROM inventory_movements im WHERE im.product_id = $1 AND ($2::bigint IS NULL OR im.bin_id = $2)
            AND ($3::date IS NULL OR im.movement_date >= $3::date) AND ($4::date IS NULL OR im.movement_date <= $4::date)`,
        [productId, binId, from, to]
    );

    let truncated = false;
    const items: HistoryItem[] = [];
    if (type !== "salida") {
        const entries = await loadEntries(pool, projectId, productId, binId, from, to, includeInProgress);
        items.push(...entries.items);
        truncated = truncated || entries.truncated;
    }
    if (type !== "entrada") {
        const exits = await loadExits(pool, projectId, productId, binId, from, to);
        items.push(...exits.items);
        truncated = truncated || exits.truncated;
    }

    return {
        product,
        filters: { bin_id: binId === null ? null : String(binId), from, to, type, sort, direction, include_in_progress: includeInProgress },
        stock: { total: stockTotal.rows[0]!.total, by_bin: stockRows.rows },
        totals: totals.rows[0]!,
        items: sortHistoryItems(items, sort, direction),
        truncated,
    };
};
