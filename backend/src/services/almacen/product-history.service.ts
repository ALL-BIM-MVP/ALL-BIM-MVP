// Hoja de vida del PRODUCTO del catálogo (Fase 9): su historia a lo largo del tiempo,
// no solo dónde está ahora. Une los movimientos de stock (entradas y salidas, con su
// casilla y su saldo) con su historia de compras (cuándo se pidió, ordenó y facturó y
// a qué proveedor y precio). Solo lectura, todo se calcula al consultar.
//
// El almacén NO maneja lotes: no se atribuye qué unidades salieron de qué ingreso. Se
// muestran los ingresos que abastecieron el producto (o la casilla) y los totales
// entrado / salido / actual.
import pool from "../../db/database.js";
import { AppError } from "../../models/errors/app-error.js";
import { PRODUCT_ERRORS } from "../../models/errors/almacen/product.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { assertBinInProject } from "./bin.service.js";
import type { ProductHistoryParam, ProductHistoryQuery } from "../../schemas/almacen/product-history.schema.js";
import type { ProductHistory, ProductHistoryEvent, ProductHistoryKind } from "../../models/almacen/product-history.models.js";

// Tope de eventos por origen: evita respuestas gigantes (se avisa con `truncated`).
export const HISTORY_MAX_EVENTS = 1000;

// Orden dentro de un mismo día: lo último de la cadena primero.
const KIND_RANK: Record<ProductHistoryKind, number> = { issued: 0, adjusted: 1, received: 2, invoiced: 3, ordered: 4, requested: 5 };

type Row = Record<string, unknown>;

const BIN_LABEL = `w.name || ' · ' || r.name || ' · ' || b.location_label`;
const BIN_JOINS = `INNER JOIN bins b ON b.bin_id = %BIN%
    INNER JOIN racks r ON r.rack_id = b.rack_id
    INNER JOIN warehouses w ON w.warehouse_id = r.warehouse_id`;

const blank = (): Omit<ProductHistoryEvent, "kind" | "date" | "document" | "quantity"> => ({
    bin: null, balance_after: null, supplier: null, unit_price: null, line_total: null, currency: null, requester: null,
    entry_type: null, purchase_order: null, destination: null, recipient_name: null,
    direction: null, reason: null, adjusted_document: null,
});

export const getProductHistoryService = async (
    user: DecodedToken, { projectId, productId }: ProductHistoryParam, query: ProductHistoryQuery
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
    if (binId !== null) await assertBinInProject(pool, projectId, binId);

    // ---- stock ACTUAL (no depende de fechas) ------------------------------------------------
    const stockRows = await pool.query<{ bin_id: number; label: string; quantity: string }>(
        `SELECT bc.bin_id, ${BIN_LABEL} AS label, bc.quantity::numeric(18,6)::text AS quantity
        FROM bin_contents bc ${BIN_JOINS.replace("%BIN%", "bc.bin_id")}
        WHERE bc.product_id = $1 AND ($2::bigint IS NULL OR bc.bin_id = $2) AND bc.quantity > 0
        ORDER BY bc.quantity DESC, bc.bin_id`,
        [productId, binId]
    );
    const stockTotal = await pool.query<{ total: string }>(
        `SELECT COALESCE(SUM(quantity), 0)::numeric(18,6)::text AS total FROM bin_contents
        WHERE product_id = $1 AND ($2::bigint IS NULL OR bin_id = $2)`,
        [productId, binId]
    );

    // ---- movimientos de stock dentro de los filtros ---------------------------------------
    const movementFilter = `im.product_id = $1 AND ($2::bigint IS NULL OR im.bin_id = $2)
        AND ($3::date IS NULL OR im.movement_date >= $3::date) AND ($4::date IS NULL OR im.movement_date <= $4::date)`;
    const totals = await pool.query<{ entered: string; exited: string; net: string }>(
        `SELECT COALESCE(SUM(im.quantity) FILTER (WHERE im.type = 'entrada'), 0)::numeric(18,6)::text AS entered,
            COALESCE(SUM(im.quantity) FILTER (WHERE im.type = 'salida'), 0)::numeric(18,6)::text AS exited,
            (COALESCE(SUM(im.quantity) FILTER (WHERE im.type = 'entrada'), 0)
                - COALESCE(SUM(im.quantity) FILTER (WHERE im.type = 'salida'), 0))::numeric(18,6)::text AS net
        FROM inventory_movements im WHERE ${movementFilter}`,
        [productId, binId, from, to]
    );
    const movements = await pool.query<Row>(
        `SELECT im.inventory_movement_id, im.type, im.quantity::text AS quantity, im.resulting_balance::text AS balance,
            im.reference_document_type, im.reference_document_id, to_char(im.movement_date, 'YYYY-MM-DD') AS date,
            im.bin_id, ${BIN_LABEL} AS bin_label,
            gr.delivery_note_series, gr.delivery_note_number, gr.entry_type, s.supplier_id, s.name AS supplier_name, o.number AS order_number,
            gi.number AS issue_number, gi.destination_sector, gi.destination_level, gi.destination_block, gi.recipient_name,
            ia.reason AS adjustment_reason, ia.goods_receipt_id AS adjusted_receipt_id, ia.goods_issue_id AS adjusted_issue_id,
            CASE WHEN ia.goods_receipt_id IS NOT NULL
                THEN (SELECT concat(x.delivery_note_series, '-', x.delivery_note_number) FROM goods_receipts x WHERE x.goods_receipt_id = ia.goods_receipt_id)
                ELSE (SELECT y.number FROM goods_issues y WHERE y.goods_issue_id = ia.goods_issue_id) END AS adjusted_label
        FROM inventory_movements im
        ${BIN_JOINS.replace("%BIN%", "im.bin_id")}
        LEFT JOIN goods_receipts gr ON im.reference_document_type = 'goods_receipt' AND gr.goods_receipt_id = im.reference_document_id
        LEFT JOIN suppliers s ON s.supplier_id = gr.supplier_id
        LEFT JOIN purchase_orders o ON o.purchase_order_id = gr.purchase_order_id
        LEFT JOIN goods_issues gi ON im.reference_document_type = 'goods_issue' AND gi.goods_issue_id = im.reference_document_id
        LEFT JOIN inventory_adjustments ia ON im.reference_document_type = 'inventory_adjustment' AND ia.inventory_adjustment_id = im.reference_document_id
        WHERE ${movementFilter}
        ORDER BY im.movement_date DESC, im.inventory_movement_id DESC LIMIT ${HISTORY_MAX_EVENTS + 1}`,
        [productId, binId, from, to]
    );

    let truncated = movements.rows.length > HISTORY_MAX_EVENTS;
    const events: ProductHistoryEvent[] = movements.rows.slice(0, HISTORY_MAX_EVENTS).map((m) => {
        const referenceType = m.reference_document_type as "goods_receipt" | "goods_issue" | "inventory_adjustment";
        const base = { ...blank(), date: String(m.date), quantity: String(m.quantity), bin: { bin_id: m.bin_id as number, label: String(m.bin_label) },
            balance_after: String(m.balance), direction: m.type as "entrada" | "salida" };
        if (referenceType === "inventory_adjustment") {
            // Ajuste (Fase 10): corrige un ingreso o un vale sin reescribirlo.
            const isReceipt = m.adjusted_receipt_id != null;
            return {
                ...base, kind: "adjusted" as const,
                document: { type: "inventory_adjustment" as const, id: m.reference_document_id as number, label: `Ajuste #${m.reference_document_id}` },
                reason: String(m.adjustment_reason),
                adjusted_document: { type: isReceipt ? "goods_receipt" as const : "goods_issue" as const, id: (isReceipt ? m.adjusted_receipt_id : m.adjusted_issue_id) as number, label: String(m.adjusted_label) },
            };
        }
        const isReceipt = referenceType === "goods_receipt";
        return {
            ...base,
            kind: isReceipt ? "received" as const : "issued" as const,
            document: {
                type: isReceipt ? "goods_receipt" as const : "goods_issue" as const,
                id: m.reference_document_id as number,
                label: isReceipt ? `${m.delivery_note_series}-${m.delivery_note_number}` : String(m.issue_number),
            },
            supplier: isReceipt && m.supplier_id != null ? { supplier_id: m.supplier_id as number, name: String(m.supplier_name) } : null,
            entry_type: isReceipt ? (m.entry_type as "normal" | "rapida") : null,
            purchase_order: isReceipt ? ((m.order_number as string | null) ?? null) : null,
            destination: isReceipt ? null : [m.destination_sector, m.destination_level, m.destination_block].join(" · "),
            recipient_name: isReceipt ? null : String(m.recipient_name),
        };
    });

    // ---- historia de compras (solo sin filtro de casilla) ---------------------------------
    // Pedido, ordenado y facturado: documentos activos, con la fecha del propio documento.
    if (binId === null) {
        const dateFilter = (column: string) => `($2::date IS NULL OR ${column} >= $2::date) AND ($3::date IS NULL OR ${column} <= $3::date)`;
        const [requested, ordered, invoiced] = await Promise.all([
            pool.query<Row>(
                `SELECT d.purchase_requisition_id AS id, d.number, to_char(d.requisition_date, 'YYYY-MM-DD') AS date, d.requester,
                    i.quantity_requested::text AS quantity
                FROM purchase_requisition_items i INNER JOIN purchase_requisitions d ON d.purchase_requisition_id = i.purchase_requisition_id
                WHERE i.product_id = $1 AND d.deleted_at IS NULL AND ${dateFilter("d.requisition_date")}
                ORDER BY d.requisition_date DESC, i.purchase_requisition_item_id DESC LIMIT ${HISTORY_MAX_EVENTS + 1}`,
                [productId, from, to]),
            pool.query<Row>(
                `SELECT d.purchase_order_id AS id, d.number, to_char(d.order_date, 'YYYY-MM-DD') AS date, d.currency, s.supplier_id, s.name AS supplier_name,
                    i.quantity_ordered::text AS quantity, i.unit_price::text AS unit_price, i.line_total::text AS line_total
                FROM purchase_order_items i INNER JOIN purchase_orders d ON d.purchase_order_id = i.purchase_order_id
                INNER JOIN suppliers s ON s.supplier_id = d.supplier_id
                WHERE i.product_id = $1 AND d.deleted_at IS NULL AND ${dateFilter("d.order_date")}
                ORDER BY d.order_date DESC, i.purchase_order_item_id DESC LIMIT ${HISTORY_MAX_EVENTS + 1}`,
                [productId, from, to]),
            pool.query<Row>(
                `SELECT d.invoice_id AS id, concat(d.series, '-', d.number) AS label, to_char(d.invoice_date, 'YYYY-MM-DD') AS date, d.currency,
                    s.supplier_id, s.name AS supplier_name, i.quantity_invoiced::text AS quantity, i.unit_price::text AS unit_price, i.line_total::text AS line_total
                FROM invoice_items i INNER JOIN invoices d ON d.invoice_id = i.invoice_id
                INNER JOIN suppliers s ON s.supplier_id = d.supplier_id
                WHERE i.product_id = $1 AND d.deleted_at IS NULL AND ${dateFilter("d.invoice_date")}
                ORDER BY d.invoice_date DESC, i.invoice_item_id DESC LIMIT ${HISTORY_MAX_EVENTS + 1}`,
                [productId, from, to]),
        ]);
        truncated = truncated || [requested, ordered, invoiced].some((r) => r.rows.length > HISTORY_MAX_EVENTS);

        for (const r of requested.rows.slice(0, HISTORY_MAX_EVENTS)) {
            events.push({ ...blank(), kind: "requested", date: String(r.date), document: { type: "requisition", id: r.id as number, label: String(r.number) },
                quantity: String(r.quantity), requester: String(r.requester) });
        }
        for (const r of ordered.rows.slice(0, HISTORY_MAX_EVENTS)) {
            events.push({ ...blank(), kind: "ordered", date: String(r.date), document: { type: "purchase_order", id: r.id as number, label: String(r.number) },
                quantity: String(r.quantity), supplier: { supplier_id: r.supplier_id as number, name: String(r.supplier_name) },
                unit_price: (r.unit_price as string | null) ?? null, line_total: String(r.line_total), currency: String(r.currency) });
        }
        for (const r of invoiced.rows.slice(0, HISTORY_MAX_EVENTS)) {
            events.push({ ...blank(), kind: "invoiced", date: String(r.date), document: { type: "invoice", id: r.id as number, label: String(r.label) },
                quantity: String(r.quantity), supplier: { supplier_id: r.supplier_id as number, name: String(r.supplier_name) },
                unit_price: (r.unit_price as string | null) ?? null, line_total: String(r.line_total), currency: String(r.currency) });
        }
    }

    // Más reciente primero; en el mismo día, lo último de la cadena primero (orden estable).
    events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : KIND_RANK[a.kind] - KIND_RANK[b.kind]));

    return {
        product,
        filters: { bin_id: binId, from, to },
        stock: { total: stockTotal.rows[0]!.total, by_bin: stockRows.rows },
        totals: totals.rows[0]!,
        timeline: events,
        truncated,
    };
};
