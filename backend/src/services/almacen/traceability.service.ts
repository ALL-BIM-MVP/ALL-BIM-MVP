// Trazabilidad DOCUMENTAL (Fase 9): desde cualquier documento se recorre la cadena
// requerimiento → cotización → orden → factura → ingreso, por LÍNEA. Sin tabla
// "ingreso" (opción B del diseño): el recorrido parte del documento indicado y sigue
// los vínculos que ya existen entre líneas. Solo lectura; solo cuentan los documentos
// activos (los ingresos no tienen baja). Las cantidades y montos son NUMERIC: se
// devuelven como string (nunca se suman en JS).
//
// Grafo de líneas (hijo → padre): cotización→requerimiento; orden→cotización y
// →requerimiento; factura→orden; ingreso→orden.
//   backward: sigue hacia los padres (ingreso → orden → cotización → requerimiento) y
//             agrega las facturas de las mismas líneas de orden.
//   forward:  sigue hacia los hijos (requerimiento/orden → cotizaciones, órdenes,
//             facturas, ingresos).
//   all:      el conjunto completo conectado.
import pool from "../../db/database.js";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { TRACEABILITY_ERRORS } from "../../models/errors/almacen/traceability.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import type { TraceabilityParam, TraceabilityQuery } from "../../schemas/almacen/traceability.schema.js";
import type {
    TraceDocument, TraceDocumentType, TraceDocuments, TraceThread, Traceability,
} from "../../models/almacen/traceability.models.js";
import type { ProductSummary } from "../../models/almacen/product.models.js";

type Db = Pick<Pool | PoolClient, "query">;
type Row = Record<string, unknown>;
type Kind = "R" | "Q" | "P" | "I" | "G";
type Sets = Record<Kind, Set<string>>;

// Tope de líneas por consulta: evita respuestas gigantes (se avisa con `truncated`).
export const TRACE_MAX_LINES = 2000;

const ANCHORS: Record<TraceDocumentType, { kind: Kind; header: string; lines: string }> = {
    "requisition": {
        kind: "R",
        header: `SELECT purchase_requisition_id AS id, number AS label FROM purchase_requisitions
            WHERE purchase_requisition_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
        lines: `SELECT purchase_requisition_item_id AS id FROM purchase_requisition_items WHERE purchase_requisition_id = $1`,
    },
    "quotation": {
        kind: "Q",
        header: `SELECT quotation_id AS id, number AS label FROM quotations
            WHERE quotation_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
        lines: `SELECT quotation_item_id AS id FROM quotation_items WHERE quotation_id = $1`,
    },
    "purchase-order": {
        kind: "P",
        header: `SELECT purchase_order_id AS id, number AS label FROM purchase_orders
            WHERE purchase_order_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
        lines: `SELECT purchase_order_item_id AS id FROM purchase_order_items WHERE purchase_order_id = $1`,
    },
    "invoice": {
        kind: "I",
        header: `SELECT invoice_id AS id, concat(series, '-', number) AS label FROM invoices
            WHERE invoice_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
        lines: `SELECT invoice_item_id AS id FROM invoice_items WHERE invoice_id = $1`,
    },
    "goods-receipt": {
        kind: "G",
        // Los ingresos no tienen baja lógica.
        header: `SELECT goods_receipt_id AS id, concat(delivery_note_series, '-', delivery_note_number) AS label FROM goods_receipts
            WHERE goods_receipt_id = $1 AND project_id = $2`,
        lines: `SELECT goods_receipt_item_id AS id FROM goods_receipt_items WHERE goods_receipt_id = $1`,
    },
};

const size = (sets: Sets): number => sets.R.size + sets.Q.size + sets.P.size + sets.I.size + sets.G.size;
const ids = (set: Set<string>): string[] => [...set];

// Un paso de expansión hacia los padres ("up") o hacia los hijos ("down"). Devuelve
// true si alguna línea nueva entró. Los hijos solo entran si su documento está activo.
const expand = async (db: Db, sets: Sets, direction: "up" | "down"): Promise<boolean> => {
    let changed = false;
    const add = (kind: Kind, rows: Row[], column: string) => {
        for (const row of rows) {
            const value = row[column];
            if (value == null) continue;
            const id = String(value);
            if (!sets[kind].has(id)) { sets[kind].add(id); changed = true; }
        }
    };
    const run = async (sql: string, list: Set<string>): Promise<Row[]> =>
        list.size === 0 ? [] : (await db.query(sql, [ids(list)])).rows as Row[];

    if (direction === "up") {
        add("P", await run(`SELECT purchase_order_item_id AS pid FROM goods_receipt_items WHERE goods_receipt_item_id = ANY($1::bigint[])`, sets.G), "pid");
        add("P", await run(`SELECT purchase_order_item_id AS pid FROM invoice_items WHERE invoice_item_id = ANY($1::bigint[])`, sets.I), "pid");
        const fromOrders = await run(
            `SELECT quotation_item_id AS qid, purchase_requisition_item_id AS rid FROM purchase_order_items
            WHERE purchase_order_item_id = ANY($1::bigint[])`, sets.P);
        add("Q", fromOrders, "qid");
        add("R", fromOrders, "rid");
        add("R", await run(`SELECT purchase_requisition_item_id AS rid FROM quotation_items WHERE quotation_item_id = ANY($1::bigint[])`, sets.Q), "rid");
    } else {
        add("Q", await run(
            `SELECT qi.quotation_item_id AS id FROM quotation_items qi
            INNER JOIN quotations q ON q.quotation_id = qi.quotation_id AND q.deleted_at IS NULL
            WHERE qi.purchase_requisition_item_id = ANY($1::bigint[])`, sets.R), "id");
        add("P", await run(
            `SELECT poi.purchase_order_item_id AS id FROM purchase_order_items poi
            INNER JOIN purchase_orders po ON po.purchase_order_id = poi.purchase_order_id AND po.deleted_at IS NULL
            WHERE poi.purchase_requisition_item_id = ANY($1::bigint[])`, sets.R), "id");
        add("P", await run(
            `SELECT poi.purchase_order_item_id AS id FROM purchase_order_items poi
            INNER JOIN purchase_orders po ON po.purchase_order_id = poi.purchase_order_id AND po.deleted_at IS NULL
            WHERE poi.quotation_item_id = ANY($1::bigint[])`, sets.Q), "id");
        add("I", await run(
            `SELECT ii.invoice_item_id AS id FROM invoice_items ii
            INNER JOIN invoices v ON v.invoice_id = ii.invoice_id AND v.deleted_at IS NULL
            WHERE ii.purchase_order_item_id = ANY($1::bigint[])`, sets.P), "id");
        add("G", await run(
            `SELECT goods_receipt_item_id AS id FROM goods_receipt_items WHERE purchase_order_item_id = ANY($1::bigint[])`, sets.P), "id");
    }
    return changed;
};

// Solo las facturas de las líneas de orden ya encontradas (cierre de "backward").
const addInvoicesOfOrders = async (db: Db, sets: Sets): Promise<void> => {
    if (sets.P.size === 0) return;
    const { rows } = await db.query<{ id: string }>(
        `SELECT ii.invoice_item_id AS id FROM invoice_items ii
        INNER JOIN invoices v ON v.invoice_id = ii.invoice_id AND v.deleted_at IS NULL
        WHERE ii.purchase_order_item_id = ANY($1::bigint[])`, [ids(sets.P)]
    );
    for (const row of rows) sets.I.add(String(row.id));
};

// Hilo = componente conexo de líneas unidas por sus vínculos (unión-búsqueda).
class UnionFind {
    private parent = new Map<string, string>();
    find(x: string): string {
        if (!this.parent.has(x)) this.parent.set(x, x);
        let root = x;
        while (this.parent.get(root) !== root) root = this.parent.get(root)!;
        this.parent.set(x, root);
        return root;
    }
    union(a: string, b: string): void { this.parent.set(this.find(a), this.find(b)); }
}

const byId = <T extends { id: string | number }>(a: T, b: T): number => Number(a.id) - Number(b.id);

export const getTraceabilityService = async (
    user: DecodedToken, { projectId, documentType, documentId }: TraceabilityParam, { direction }: TraceabilityQuery,
    options: { maxLines?: number } = {}
): Promise<Traceability> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    const maxLines = options.maxLines ?? TRACE_MAX_LINES;

    const anchorConfig = ANCHORS[documentType];
    const header = await pool.query<{ id: number; label: string }>(anchorConfig.header, [documentId, projectId]);
    if (!header.rows[0]) throw new AppError(TRACEABILITY_ERRORS.DOCUMENT_NOT_FOUND);

    const sets: Sets = { R: new Set(), Q: new Set(), P: new Set(), I: new Set(), G: new Set() };
    const anchorLines = await pool.query<{ id: string }>(anchorConfig.lines, [documentId]);
    for (const row of anchorLines.rows) sets[anchorConfig.kind].add(String(row.id));

    // Recorrido por líneas hasta que no entren líneas nuevas (o se alcance el tope).
    let truncated = false;
    const overLimit = () => { if (size(sets) > maxLines) { truncated = true; return true; } return false; };
    if (direction === "backward") {
        while (!overLimit() && await expand(pool, sets, "up")) { /* sube hasta el requerimiento */ }
        if (!truncated) await addInvoicesOfOrders(pool, sets);
    } else if (direction === "forward") {
        while (!overLimit() && await expand(pool, sets, "down")) { /* baja hasta los ingresos */ }
    } else {
        // all: el conjunto completo conectado (sube y baja hasta estabilizarse).
        let progress = true;
        while (progress && !overLimit()) {
            const up = await expand(pool, sets, "up");
            const down = await expand(pool, sets, "down");
            progress = up || down;
        }
    }

    // ---- detalle de las líneas encontradas -------------------------------------------------
    const q = async (sql: string, list: Set<string>): Promise<Row[]> =>
        list.size === 0 ? [] : (await pool.query(sql, [ids(list)])).rows as Row[];

    const [rLines, qLines, pLines, iLines, gLines, gLocations] = await Promise.all([
        q(`SELECT ri.purchase_requisition_item_id AS id, ri.purchase_requisition_id AS document_id, ri.product_id, ri.description,
                ri.quantity_requested::text AS quantity_requested, ri.estimated_unit_price::text AS estimated_unit_price
            FROM purchase_requisition_items ri WHERE ri.purchase_requisition_item_id = ANY($1::bigint[])`, sets.R),
        q(`SELECT qi.quotation_item_id AS id, qi.quotation_id AS document_id, qi.product_id, qi.purchase_requisition_item_id AS rid, qi.description,
                qi.quantity_quoted::text AS quantity_quoted, qi.unit_price::text AS unit_price, qi.line_total::text AS line_total
            FROM quotation_items qi WHERE qi.quotation_item_id = ANY($1::bigint[])`, sets.Q),
        q(`SELECT poi.purchase_order_item_id AS id, poi.purchase_order_id AS document_id, poi.product_id, poi.quotation_item_id AS qid,
                poi.purchase_requisition_item_id AS rid, poi.description, poi.quantity_ordered::text AS quantity_ordered,
                poi.unit_price::text AS unit_price, poi.line_total::text AS line_total
            FROM purchase_order_items poi WHERE poi.purchase_order_item_id = ANY($1::bigint[])`, sets.P),
        q(`SELECT ii.invoice_item_id AS id, ii.invoice_id AS document_id, ii.product_id, ii.purchase_order_item_id AS pid, ii.description,
                ii.quantity_invoiced::text AS quantity_invoiced, ii.unit_price::text AS unit_price, ii.line_total::text AS line_total
            FROM invoice_items ii WHERE ii.invoice_item_id = ANY($1::bigint[])`, sets.I),
        q(`SELECT gri.goods_receipt_item_id AS id, gri.goods_receipt_id AS document_id, gri.product_id, gri.purchase_order_item_id AS pid,
                gri.total_quantity::text AS quantity_registered,
                COALESCE((SELECT SUM(a.quantity_delta) FROM inventory_adjustment_items a WHERE a.goods_receipt_item_id = gri.goods_receipt_item_id), 0)::numeric(18,6)::text AS quantity_adjusted,
                (gri.total_quantity + COALESCE((SELECT SUM(a.quantity_delta) FROM inventory_adjustment_items a WHERE a.goods_receipt_item_id = gri.goods_receipt_item_id), 0))::numeric(18,6)::text AS quantity_received,
                gri.quantity_per_delivery_note::text AS quantity_per_delivery_note, gri.description
            FROM goods_receipt_items gri WHERE gri.goods_receipt_item_id = ANY($1::bigint[])`, sets.G),
        // Casillas EFECTIVAS: lo registrado más los ajustes (Fase 10), sin las que quedaron en cero.
        q(`SELECT t.item_id, t.bin_id, SUM(t.q)::numeric(18,6)::text AS quantity, w.name || ' · ' || r.name || ' · ' || b.location_label AS label
            FROM (
                SELECT goods_receipt_item_id AS item_id, bin_id, quantity AS q FROM goods_receipt_item_locations WHERE goods_receipt_item_id = ANY($1::bigint[])
                UNION ALL
                SELECT goods_receipt_item_id, bin_id, quantity_delta FROM inventory_adjustment_items WHERE goods_receipt_item_id = ANY($1::bigint[])
            ) t
            INNER JOIN bins b ON b.bin_id = t.bin_id
            INNER JOIN racks r ON r.rack_id = b.rack_id
            INNER JOIN warehouses w ON w.warehouse_id = r.warehouse_id
            GROUP BY t.item_id, t.bin_id, w.name, r.name, b.location_label HAVING SUM(t.q) <> 0
            ORDER BY t.item_id, t.bin_id`, sets.G),
    ]);

    // ---- documentos del recorrido ----------------------------------------------------------
    const docIds = (rows: Row[]): Set<string> => new Set(rows.map((r) => String(r.document_id)));
    const anchorId = String(documentId);
    const isAnchor = (type: TraceDocumentType, id: unknown) => type === documentType && String(id) === anchorId;
    const docsOf = async (type: TraceDocumentType, sql: string, list: Set<string>): Promise<TraceDocument[]> => {
        const rows = await q(sql, list);
        return rows.map((r) => ({
            id: r.id as number, label: String(r.label), date: String(r.date),
            supplier: r.supplier_id == null ? null : { supplier_id: r.supplier_id as number, ruc: String(r.supplier_ruc), name: String(r.supplier_name) },
            delivery_note_date: (r.delivery_note_date as string | null) ?? null,
            has_file: Boolean(r.has_file),
            entry_type: (r.entry_type as "normal" | "rapida" | null) ?? null,
            requester: (r.requester as string | null) ?? null,
            currency: (r.currency as string | null) ?? null,
            voided: Boolean(r.voided),
            is_anchor: isAnchor(type, r.id),
        })).sort(byId);
    };
    const documents: TraceDocuments = {
        requisitions: await docsOf("requisition",
            `SELECT purchase_requisition_id AS id, number AS label, to_char(requisition_date, 'YYYY-MM-DD') AS date, requester,
                NULL::int AS supplier_id, NULL::text AS supplier_ruc, NULL::text AS supplier_name, NULL::text AS delivery_note_date, file_id IS NOT NULL AS has_file, NULL::text AS entry_type, NULL::text AS currency, false AS voided
            FROM purchase_requisitions WHERE purchase_requisition_id = ANY($1::bigint[])`, docIds(rLines)),
        quotations: await docsOf("quotation",
            `SELECT d.quotation_id AS id, d.number AS label, to_char(d.quotation_date, 'YYYY-MM-DD') AS date, NULL::text AS requester,
                s.supplier_id, s.ruc AS supplier_ruc, s.name AS supplier_name, NULL::text AS delivery_note_date, d.file_id IS NOT NULL AS has_file, NULL::text AS entry_type, d.currency, false AS voided
            FROM quotations d INNER JOIN suppliers s ON s.supplier_id = d.supplier_id WHERE d.quotation_id = ANY($1::bigint[])`, docIds(qLines)),
        purchase_orders: await docsOf("purchase-order",
            `SELECT d.purchase_order_id AS id, d.number AS label, to_char(d.order_date, 'YYYY-MM-DD') AS date, NULL::text AS requester,
                s.supplier_id, s.ruc AS supplier_ruc, s.name AS supplier_name, NULL::text AS delivery_note_date, d.file_id IS NOT NULL AS has_file, NULL::text AS entry_type, d.currency, false AS voided
            FROM purchase_orders d INNER JOIN suppliers s ON s.supplier_id = d.supplier_id WHERE d.purchase_order_id = ANY($1::bigint[])`, docIds(pLines)),
        invoices: await docsOf("invoice",
            `SELECT d.invoice_id AS id, concat(d.series, '-', d.number) AS label, to_char(d.invoice_date, 'YYYY-MM-DD') AS date, NULL::text AS requester,
                s.supplier_id, s.ruc AS supplier_ruc, s.name AS supplier_name, NULL::text AS delivery_note_date, d.file_id IS NOT NULL AS has_file, NULL::text AS entry_type, d.currency, false AS voided
            FROM invoices d INNER JOIN suppliers s ON s.supplier_id = d.supplier_id WHERE d.invoice_id = ANY($1::bigint[])`, docIds(iLines)),
        goods_receipts: await docsOf("goods-receipt",
            `SELECT d.goods_receipt_id AS id, concat(d.delivery_note_series, '-', d.delivery_note_number) AS label, to_char(d.received_date, 'YYYY-MM-DD') AS date,
                NULL::text AS requester, s.supplier_id, s.ruc AS supplier_ruc, s.name AS supplier_name, to_char(d.delivery_note_date, 'YYYY-MM-DD') AS delivery_note_date, d.file_id IS NOT NULL AS has_file, d.entry_type, NULL::text AS currency, d.voided_at IS NOT NULL AS voided
            FROM goods_receipts d INNER JOIN suppliers s ON s.supplier_id = d.supplier_id WHERE d.goods_receipt_id = ANY($1::bigint[])`, docIds(gLines)),
    };

    // ---- hilos: un elemento con todas sus líneas encadenadas -------------------------------
    const uf = new UnionFind();
    const key = (kind: Kind, id: unknown) => `${kind}:${id}`;
    for (const r of rLines) uf.find(key("R", r.id));
    for (const l of qLines) { uf.find(key("Q", l.id)); if (sets.R.has(String(l.rid))) uf.union(key("Q", l.id), key("R", l.rid)); }
    for (const l of pLines) {
        uf.find(key("P", l.id));
        if (l.qid != null && sets.Q.has(String(l.qid))) uf.union(key("P", l.id), key("Q", l.qid));
        if (l.rid != null && sets.R.has(String(l.rid))) uf.union(key("P", l.id), key("R", l.rid));
    }
    for (const l of iLines) { uf.find(key("I", l.id)); if (l.pid != null && sets.P.has(String(l.pid))) uf.union(key("I", l.id), key("P", l.pid)); }
    for (const l of gLines) { uf.find(key("G", l.id)); if (l.pid != null && sets.P.has(String(l.pid))) uf.union(key("G", l.id), key("P", l.pid)); }

    const productIds = new Set<string>([...rLines, ...qLines, ...pLines, ...iLines, ...gLines].map((l) => String(l.product_id)));
    const productRows = productIds.size === 0 ? [] : (await pool.query<ProductSummary>(
        `SELECT product_id, category_id, code, display_id, name, unit FROM products WHERE product_id = ANY($1::bigint[])`, [[...productIds]]
    )).rows;
    const products = new Map(productRows.map((p) => [String(p.product_id), p]));

    const threads = new Map<string, TraceThread & { firstProduct: string }>();
    const threadOf = (kind: Kind, line: Row): TraceThread => {
        const root = uf.find(key(kind, line.id));
        let thread = threads.get(root);
        if (!thread) {
            thread = {
                product: products.get(String(line.product_id))!, contains_anchor: false,
                requisition_items: [], quotation_items: [], purchase_order_items: [], invoice_items: [], receipt_items: [],
                firstProduct: String(line.product_id),
            };
            threads.set(root, thread);
        }
        return thread;
    };
    const mark = (thread: TraceThread, type: TraceDocumentType, line: Row) => { if (isAnchor(type, line.document_id)) thread.contains_anchor = true; };

    for (const l of rLines) {
        const t = threadOf("R", l); mark(t, "requisition", l);
        t.requisition_items.push({ id: l.id as number, document_id: l.document_id as number, description: String(l.description), quantity_requested: String(l.quantity_requested), estimated_unit_price: (l.estimated_unit_price as string | null) ?? null });
    }
    for (const l of qLines) {
        const t = threadOf("Q", l); mark(t, "quotation", l);
        t.quotation_items.push({ id: l.id as number, document_id: l.document_id as number, description: String(l.description), quantity_quoted: String(l.quantity_quoted), unit_price: (l.unit_price as string | null) ?? null, line_total: String(l.line_total) });
    }
    for (const l of pLines) {
        const t = threadOf("P", l); mark(t, "purchase-order", l);
        t.purchase_order_items.push({ id: l.id as number, document_id: l.document_id as number, description: String(l.description), quantity_ordered: String(l.quantity_ordered), unit_price: (l.unit_price as string | null) ?? null, line_total: String(l.line_total) });
    }
    for (const l of iLines) {
        const t = threadOf("I", l); mark(t, "invoice", l);
        t.invoice_items.push({ id: l.id as number, document_id: l.document_id as number, description: String(l.description), quantity_invoiced: String(l.quantity_invoiced), unit_price: (l.unit_price as string | null) ?? null, line_total: String(l.line_total) });
    }
    for (const l of gLines) {
        const t = threadOf("G", l); mark(t, "goods-receipt", l);
        t.receipt_items.push({
            id: l.id as number, document_id: l.document_id as number, description: String(l.description), quantity_received: String(l.quantity_received),
            quantity_registered: String(l.quantity_registered), quantity_adjusted: String(l.quantity_adjusted),
            quantity_per_delivery_note: (l.quantity_per_delivery_note as string | null) ?? null,
            locations: gLocations.filter((loc) => String(loc.item_id) === String(l.id)).map((loc) => ({ bin_id: loc.bin_id as number, label: String(loc.label), quantity: String(loc.quantity) })),
        });
    }

    const ordered = [...threads.values()].map(({ firstProduct: _firstProduct, ...thread }) => {
        thread.requisition_items.sort(byId); thread.quotation_items.sort(byId); thread.purchase_order_items.sort(byId);
        thread.invoice_items.sort(byId); thread.receipt_items.sort(byId);
        return thread;
    });
    // Los hilos con requerimiento primero (por su línea), luego el resto por su primera línea.
    const firstId = (t: TraceThread) => Number(
        t.requisition_items[0]?.id ?? t.quotation_items[0]?.id ?? t.purchase_order_items[0]?.id ?? t.invoice_items[0]?.id ?? t.receipt_items[0]?.id ?? 0
    );
    const rank = (t: TraceThread) => (t.requisition_items.length ? 0 : t.quotation_items.length ? 1 : t.purchase_order_items.length ? 2 : t.invoice_items.length ? 3 : 4);
    ordered.sort((a, b) => rank(a) - rank(b) || firstId(a) - firstId(b));

    return {
        anchor: { type: documentType, id: header.rows[0].id, label: String(header.rows[0].label) },
        direction, truncated, documents, threads: ordered,
    };
};
