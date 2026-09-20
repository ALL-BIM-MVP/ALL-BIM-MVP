// purchase_orders (Orden de compra) + sus líneas — Fase 5 de
// docs/almacen-ingreso-productos/05-roadmap.md. Registro de auditoría: no
// mueve stock ni tiene aprobaciones. Mismo patrón que quotation.service.ts
// (PATCH parcial de cabecera y líneas con ids estables, archivo con PUT, baja
// con `configure` que elimina también el archivo). Diferencias: el origen
// (requerimiento/cotización) es OPCIONAL (compra directa), pero si existe, cada
// línea debe citar la de ese origen (las mismas líneas llegan hasta el almacén);
// y la orden guarda su propia copia (snapshot) de cantidades y precios.
import pool from "../../db/database.js";
import type { PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { PURCHASE_ORDER_ERRORS } from "../../models/errors/almacen/purchase-order.errors.js";
import { PURCHASE_REQUISITION_ERRORS } from "../../models/errors/almacen/purchase-requisition.errors.js";
import { QUOTATION_ERRORS } from "../../models/errors/almacen/quotation.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { buildSet } from "../../utils/partial-update.js";
import { filePendingAlert, getPurchaseOrderItemStatus } from "./document-status.service.js";
import { containsPattern } from "../../utils/like-search.js";
import { buildSignedFileUrl } from "../../utils/file-signing.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { assertSupplierInProject } from "./supplier.service.js";
import { assertProductInProject } from "./product.service.js";
import {
    lockDocument, removeFileBytes, replaceDocumentFile, softDeleteDocument, type DocumentConfig,
} from "./document-file.service.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type {
    CreatePurchaseOrderBody, CreatePurchaseOrderItemBody, ListPurchaseOrdersQuery, PurchaseOrderIdParam,
    PurchaseOrderItemIdParam, SetPurchaseOrderFileBody, UpdatePurchaseOrderBody, UpdatePurchaseOrderItemBody,
} from "../../schemas/almacen/purchase-order.schema.js";
import type {
    PurchaseOrderDetail, PurchaseOrderFile, PurchaseOrderItem, PurchaseOrderRow,
} from "../../models/almacen/purchase-order.models.js";

const UNIQUE_VIOLATION = "23505";

const ORDER_DOC: DocumentConfig = {
    table: "purchase_orders",
    idColumn: "purchase_order_id",
    notFoundError: PURCHASE_ORDER_ERRORS.NOT_FOUND,
};
const lockOrder = (client: PoolClient, projectId: number, purchaseOrderId: number) =>
    lockDocument(client, ORDER_DOC, projectId, purchaseOrderId);

// Cabecera con proveedor y origen embebidos (null si no hay) y la suma de las
// líneas. Fragmento fijo del servidor (alias o).
const HEADER_COLUMNS_SQL = `
    o.purchase_order_id, o.project_id, o.number, to_char(o.order_date, 'YYYY-MM-DD') AS order_date,
    o.currency, o.commercial_terms, o.total_amount,
    (SELECT COALESCE(SUM(i.line_total), 0) FROM purchase_order_items i WHERE i.purchase_order_id = o.purchase_order_id) AS lines_total,
    json_build_object('supplier_id', s.supplier_id, 'ruc', s.ruc, 'name', s.name) AS supplier,
    CASE WHEN pr.purchase_requisition_id IS NULL THEN NULL
        ELSE json_build_object('purchase_requisition_id', pr.purchase_requisition_id, 'number', pr.number) END AS purchase_requisition,
    CASE WHEN q.quotation_id IS NULL THEN NULL
        ELSE json_build_object('quotation_id', q.quotation_id, 'number', q.number) END AS quotation,
    o.created_at, o.created_by, o.updated_at, o.updated_by`;
const HEADER_FROM_SQL = `
    FROM purchase_orders o
    INNER JOIN suppliers s ON s.supplier_id = o.supplier_id
    LEFT JOIN purchase_requisitions pr ON pr.purchase_requisition_id = o.purchase_requisition_id
    LEFT JOIN quotations q ON q.quotation_id = o.quotation_id`;

const ITEM_SELECT = `
    SELECT i.purchase_order_item_id, i.purchase_order_id, i.quotation_item_id, i.purchase_requisition_item_id,
        i.product_id, i.description, i.quantity_ordered, i.unit_price, i.discount_amount, i.tax_amount,
        i.line_total, i.notes,
        json_build_object('product_id', p.product_id, 'code', p.code, 'name', p.name, 'unit', p.unit) AS product,
        CASE WHEN qi.quotation_item_id IS NULL THEN NULL
            ELSE json_build_object('quotation_item_id', qi.quotation_item_id, 'description', qi.description,
                'quantity_quoted', qi.quantity_quoted::text) END AS quotation_item,
        CASE WHEN ri.purchase_requisition_item_id IS NULL THEN NULL
            ELSE json_build_object('purchase_requisition_item_id', ri.purchase_requisition_item_id,
                'description', ri.description, 'quantity_requested', ri.quantity_requested::text) END AS requisition_item
    FROM purchase_order_items i
    INNER JOIN products p ON p.product_id = i.product_id
    LEFT JOIN quotation_items qi ON qi.quotation_item_id = i.quotation_item_id
    LEFT JOIN purchase_requisition_items ri ON ri.purchase_requisition_item_id = i.purchase_requisition_item_id`;

export const listPurchaseOrdersService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, query: ListPurchaseOrdersQuery
): Promise<PurchaseOrderRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const params: unknown[] = [
        projectId, query.supplier_id ?? null, query.purchase_requisition_id ?? null, query.quotation_id ?? null,
    ];
    let filter = "";
    if (query.search) {
        params.push(containsPattern(query.search));
        filter = `AND (o.number ILIKE $5 OR s.name ILIKE $5)`;
    }
    const { rows } = await pool.query<PurchaseOrderRow>(
        `SELECT ${HEADER_COLUMNS_SQL},
            (SELECT COUNT(*) FROM purchase_order_items i WHERE i.purchase_order_id = o.purchase_order_id)::int AS items_count,
            o.file_id IS NOT NULL AS has_file
        ${HEADER_FROM_SQL}
        WHERE o.project_id = $1 AND o.deleted_at IS NULL
            AND ($2::int IS NULL OR o.supplier_id = $2)
            AND ($3::bigint IS NULL OR o.purchase_requisition_id = $3)
            AND ($4::bigint IS NULL OR o.quotation_id = $4) ${filter}
        ORDER BY o.order_date DESC, o.purchase_order_id DESC`,
        params
    );
    return rows;
};

const loadDetail = async (
    client: Pick<PoolClient, "query">, projectId: number, purchaseOrderId: number
): Promise<PurchaseOrderDetail> => {
    const headerResult = await client.query<Omit<PurchaseOrderDetail, "items" | "file">>(
        `SELECT ${HEADER_COLUMNS_SQL} ${HEADER_FROM_SQL}
        WHERE o.purchase_order_id = $1 AND o.project_id = $2 AND o.deleted_at IS NULL`,
        [purchaseOrderId, projectId]
    );
    const header = headerResult.rows[0];
    if (!header) throw new AppError(PURCHASE_ORDER_ERRORS.NOT_FOUND);

    const items = await client.query<Omit<PurchaseOrderItem, "progress" | "alerts">>(
        `${ITEM_SELECT} WHERE i.purchase_order_id = $1 ORDER BY i.purchase_order_item_id`, [purchaseOrderId]
    );
    // Estado derivado (Fase 8): avance acumulado de cada línea (ordenado / facturado / recibido / pendiente).
    const status = await getPurchaseOrderItemStatus(client, items.rows.map((i) => i.purchase_order_item_id));
    const fileResult = await client.query<Omit<PurchaseOrderFile, "url">>(
        `SELECT f.file_id, f.name, f.mime_type, f.file_size
        FROM purchase_orders o INNER JOIN files f ON f.file_id = o.file_id WHERE o.purchase_order_id = $1`,
        [purchaseOrderId]
    );
    const file = fileResult.rows[0];

    return {
        ...header,
        items: items.rows.map((i) => {
            const s = status.get(String(i.purchase_order_item_id))!;
            return { ...i, progress: s.progress, alerts: s.alerts("order") };
        }),
        file: file ? { ...file, url: buildSignedFileUrl(file.file_id, "content") } : null,
        alerts: file ? [] : [filePendingAlert()],
    };
};

export const getPurchaseOrderByIdService = async (
    user: DecodedToken, { projectId, purchaseOrderId }: PurchaseOrderIdParam
): Promise<PurchaseOrderDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return loadDetail(pool, projectId, purchaseOrderId);
};

interface ResolvedOrigin {
    quotationId: number | null;
    requisitionId: number | null;
}

// Resuelve y valida el origen de la cabecera (todo opcional). Toma con
// FOR SHARE los documentos de origen: no se edita ni se da de baja una
// cotización/requerimiento mientras se crea una orden que los cita.
const resolveOrigin = async (
    client: PoolClient, projectId: number, supplierId: number,
    body: Pick<CreatePurchaseOrderBody, "quotation_id" | "purchase_requisition_id">
): Promise<ResolvedOrigin> => {
    let quotationId: number | null = null;
    let requisitionId: number | null = body.purchase_requisition_id ?? null;

    if (body.quotation_id != null) {
        const { rows } = await client.query<{ supplier_id: number; purchase_requisition_id: number }>(
            `SELECT supplier_id, purchase_requisition_id FROM quotations
            WHERE quotation_id = $1 AND project_id = $2 AND deleted_at IS NULL FOR SHARE`,
            [body.quotation_id, projectId]
        );
        const quotation = rows[0];
        if (!quotation) throw new AppError(QUOTATION_ERRORS.NOT_FOUND);
        // BIGINT/INT llegan como string/número desde pg: se comparan como texto.
        if (String(quotation.supplier_id) !== String(supplierId)) throw new AppError(PURCHASE_ORDER_ERRORS.SUPPLIER_MISMATCH);
        if (requisitionId != null && String(requisitionId) !== String(quotation.purchase_requisition_id)) {
            throw new AppError(PURCHASE_ORDER_ERRORS.ORIGIN_MISMATCH);
        }
        quotationId = body.quotation_id;
        // Con cotización, el requerimiento se deduce de ella.
        requisitionId = quotation.purchase_requisition_id;
    }

    if (requisitionId != null) {
        const requisition = await client.query(
            `SELECT 1 FROM purchase_requisitions
            WHERE purchase_requisition_id = $1 AND project_id = $2 AND deleted_at IS NULL FOR SHARE`,
            [requisitionId, projectId]
        );
        if (requisition.rowCount === 0) throw new AppError(PURCHASE_REQUISITION_ERRORS.NOT_FOUND);
    }
    return { quotationId, requisitionId };
};

interface ResolvedLinks {
    quotationItemId: number | null;
    requisitionItemId: number | null;
    productId: number;
}

// Valida los vínculos de una línea contra el origen de la cabecera y resuelve su
// producto. REGLA (pedido del cliente: las mismas líneas del requerimiento llegan
// hasta el almacén): si la orden tiene origen, CADA línea cita la de ese origen
// (línea de la cotización si hay cotización; si no, línea del requerimiento). Sin
// origen (compra directa) no hay vínculos y la línea trae su product_id. El
// producto es el de la línea citada (si envía product_id debe coincidir).
// Aflojar la regla (línea sin vínculo) es quitar el bloque LINK_REQUIRED.
const resolveItemLinks = async (
    client: PoolClient, projectId: number, origin: ResolvedOrigin, item: CreatePurchaseOrderItemBody
): Promise<ResolvedLinks> => {
    let quotationItemId: number | null = null;
    let requisitionItemId: number | null = item.purchase_requisition_item_id ?? null;
    let derivedProductId: number | null = null;

    // Con origen, la línea debe citar la de ese origen: la de la cotización si la
    // orden tiene cotización; si solo tiene requerimiento, la del requerimiento.
    if (origin.quotationId != null && item.quotation_item_id == null) throw new AppError(PURCHASE_ORDER_ERRORS.LINK_REQUIRED);
    if (origin.quotationId == null && origin.requisitionId != null && item.purchase_requisition_item_id == null) {
        throw new AppError(PURCHASE_ORDER_ERRORS.LINK_REQUIRED);
    }

    if (item.quotation_item_id != null) {
        if (origin.quotationId == null) throw new AppError(PURCHASE_ORDER_ERRORS.LINK_INVALID);
        const { rows } = await client.query<{ product_id: number; purchase_requisition_item_id: number }>(
            `SELECT product_id, purchase_requisition_item_id FROM quotation_items
            WHERE quotation_item_id = $1 AND quotation_id = $2`,
            [item.quotation_item_id, origin.quotationId]
        );
        if (!rows[0]) throw new AppError(PURCHASE_ORDER_ERRORS.LINK_INVALID);
        if (requisitionItemId != null && String(requisitionItemId) !== String(rows[0].purchase_requisition_item_id)) {
            throw new AppError(PURCHASE_ORDER_ERRORS.LINK_INVALID);
        }
        quotationItemId = item.quotation_item_id;
        // La línea de requerimiento se deduce de la de cotización.
        requisitionItemId = rows[0].purchase_requisition_item_id;
        derivedProductId = rows[0].product_id;
    } else if (requisitionItemId != null) {
        if (origin.requisitionId == null) throw new AppError(PURCHASE_ORDER_ERRORS.LINK_INVALID);
        const { rows } = await client.query<{ product_id: number }>(
            `SELECT product_id FROM purchase_requisition_items
            WHERE purchase_requisition_item_id = $1 AND purchase_requisition_id = $2`,
            [requisitionItemId, origin.requisitionId]
        );
        if (!rows[0]) throw new AppError(PURCHASE_ORDER_ERRORS.LINK_INVALID);
        derivedProductId = rows[0].product_id;
    }

    if (derivedProductId != null) {
        if (item.product_id !== undefined && String(item.product_id) !== String(derivedProductId)) {
            throw new AppError(PURCHASE_ORDER_ERRORS.PRODUCT_MISMATCH);
        }
        return { quotationItemId, requisitionItemId, productId: derivedProductId };
    }

    if (item.product_id === undefined) throw new AppError(PURCHASE_ORDER_ERRORS.PRODUCT_REQUIRED);
    await assertProductInProject(client, projectId, item.product_id);
    return { quotationItemId: null, requisitionItemId: null, productId: item.product_id };
};

const insertItem = async (
    client: PoolClient, projectId: number, purchaseOrderId: number, origin: ResolvedOrigin, item: CreatePurchaseOrderItemBody
) => {
    const links = await resolveItemLinks(client, projectId, origin, item);
    await client.query(
        `INSERT INTO purchase_order_items
            (purchase_order_id, quotation_item_id, purchase_requisition_item_id, product_id, description,
             quantity_ordered, unit_price, discount_amount, tax_amount, line_total, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [purchaseOrderId, links.quotationItemId, links.requisitionItemId, links.productId, item.description,
            item.quantity_ordered, item.unit_price ?? null, item.discount_amount ?? null, item.tax_amount ?? null,
            item.line_total, item.notes ?? null]
    );
};

export const createPurchaseOrderService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreatePurchaseOrderBody
): Promise<PurchaseOrderDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await assertSupplierInProject(client, projectId, body.supplier_id);
        const origin = await resolveOrigin(client, projectId, body.supplier_id, body);

        const { rows } = await client.query<{ purchase_order_id: number }>(
            `INSERT INTO purchase_orders
                (project_id, supplier_id, purchase_requisition_id, quotation_id, number, order_date, currency,
                 commercial_terms, total_amount, created_by)
            VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10) RETURNING purchase_order_id`,
            [projectId, body.supplier_id, origin.requisitionId, origin.quotationId, body.number, body.order_date,
                body.currency, body.commercial_terms ?? null, body.total_amount ?? null, user.user_id]
        );
        const purchaseOrderId = rows[0]!.purchase_order_id;
        for (const item of body.items) await insertItem(client, projectId, purchaseOrderId, origin, item);

        const detail = await loadDetail(client, projectId, purchaseOrderId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new AppError(PURCHASE_ORDER_ERRORS.DUPLICATE_NUMBER);
        throw error;
    } finally {
        client.release();
    }
};

const HEADER_COLUMNS = ["number", "order_date", "currency", "commercial_terms", "total_amount"] as const;

export const updatePurchaseOrderService = async (
    user: DecodedToken, { projectId, purchaseOrderId }: PurchaseOrderIdParam, body: UpdatePurchaseOrderBody
): Promise<PurchaseOrderDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const { set, values } = buildSet(HEADER_COLUMNS, body, 4);
    try {
        const { rowCount } = await pool.query(
            `UPDATE purchase_orders SET ${set}, updated_at = NOW(), updated_by = $3
            WHERE purchase_order_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
            [purchaseOrderId, projectId, user.user_id, ...values]
        );
        if (rowCount === 0) throw new AppError(PURCHASE_ORDER_ERRORS.NOT_FOUND);
    } catch (error) {
        if (error instanceof AppError) throw error;
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new AppError(PURCHASE_ORDER_ERRORS.DUPLICATE_NUMBER);
        throw error;
    }
    return loadDetail(pool, projectId, purchaseOrderId);
};

const touchOrder = (client: PoolClient, purchaseOrderId: number, userId: number) =>
    client.query(`UPDATE purchase_orders SET updated_at = NOW(), updated_by = $2 WHERE purchase_order_id = $1`, [purchaseOrderId, userId]);

// Dar de baja exige `configure` (la auditoría no la elimina un Editor) y
// elimina también el archivo físico. Sus líneas quedan (auditoría).
export const deletePurchaseOrderService = async (
    user: DecodedToken, { projectId, purchaseOrderId }: PurchaseOrderIdParam
): Promise<void> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "configure");

    const client = await pool.connect();
    let removed = null;
    try {
        await client.query("BEGIN");
        await lockOrder(client, projectId, purchaseOrderId);
        // Una orden con facturas activas o con ingresos no se da de baja: se dan de
        // baja primero las facturas. (El bloqueo de arriba serializa contra crear una
        // factura o un ingreso, que toman la orden con FOR SHARE.)
        // Los ingresos no se dan de baja (se anulan): una orden con ingresos VIGENTES no se da de baja.
        const invoiced = await client.query(
            `SELECT 1 FROM invoices WHERE purchase_order_id = $1 AND deleted_at IS NULL
            UNION ALL
            SELECT 1 FROM goods_receipts WHERE purchase_order_id = $1 AND voided_at IS NULL
            LIMIT 1`,
            [purchaseOrderId]
        );
        if (invoiced.rowCount) throw new AppError(PURCHASE_ORDER_ERRORS.HAS_DOCUMENTS);
        removed = await softDeleteDocument(client, ORDER_DOC, projectId, purchaseOrderId, user.user_id);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
    await removeFileBytes(removed);
};

export const setPurchaseOrderFileService = async (
    user: DecodedToken, { projectId, purchaseOrderId }: PurchaseOrderIdParam, { file_id: newFileId }: SetPurchaseOrderFileBody
): Promise<PurchaseOrderDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    let removed = null;
    try {
        await client.query("BEGIN");
        removed = await replaceDocumentFile(client, ORDER_DOC, projectId, purchaseOrderId, user.user_id, newFileId);
        const detail = await loadDetail(client, projectId, purchaseOrderId);
        await client.query("COMMIT");
        await removeFileBytes(removed);
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const addPurchaseOrderItemService = async (
    user: DecodedToken, { projectId, purchaseOrderId }: PurchaseOrderIdParam, body: CreatePurchaseOrderItemBody
): Promise<PurchaseOrderDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockOrder(client, projectId, purchaseOrderId);
        const { rows } = await client.query<{ quotation_id: number | null; purchase_requisition_id: number | null }>(
            `SELECT quotation_id, purchase_requisition_id FROM purchase_orders WHERE purchase_order_id = $1`, [purchaseOrderId]
        );
        // FOR SHARE del origen (mismo criterio que al crear la orden).
        const origin: ResolvedOrigin = { quotationId: rows[0]!.quotation_id, requisitionId: rows[0]!.purchase_requisition_id };
        if (origin.quotationId != null) {
            await client.query(`SELECT 1 FROM quotations WHERE quotation_id = $1 FOR SHARE`, [origin.quotationId]);
        }
        if (origin.requisitionId != null) {
            await client.query(`SELECT 1 FROM purchase_requisitions WHERE purchase_requisition_id = $1 FOR SHARE`, [origin.requisitionId]);
        }
        await insertItem(client, projectId, purchaseOrderId, origin, body);
        await touchOrder(client, purchaseOrderId, user.user_id);
        const detail = await loadDetail(client, projectId, purchaseOrderId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const ITEM_COLUMNS = ["description", "quantity_ordered", "unit_price", "discount_amount", "tax_amount", "line_total", "notes"] as const;
const LOCKED_ITEM_COLUMNS = ["quantity_ordered", "unit_price", "discount_amount", "tax_amount", "line_total"] as const;

export const updatePurchaseOrderItemService = async (
    user: DecodedToken, { projectId, purchaseOrderId, itemId }: PurchaseOrderItemIdParam, body: UpdatePurchaseOrderItemBody
): Promise<PurchaseOrderDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockOrder(client, projectId, purchaseOrderId);

        // Cantidad y montos son lo que las facturas y los ingresos ya tomaron: con una
        // factura ACTIVA o un ingreso sobre esta línea no cambian (descripción y
        // observaciones sí). Las facturas dadas de baja no cuentan.
        if (LOCKED_ITEM_COLUMNS.some((column) => body[column] !== undefined)) {
            const invoiced = await client.query(
                `SELECT 1 FROM invoice_items ii INNER JOIN invoices v ON v.invoice_id = ii.invoice_id
                WHERE ii.purchase_order_item_id = $1 AND v.deleted_at IS NULL
                UNION ALL
                SELECT 1 FROM goods_receipt_items gri INNER JOIN goods_receipts gr ON gr.goods_receipt_id = gri.goods_receipt_id AND gr.voided_at IS NULL
                WHERE gri.purchase_order_item_id = $1
                LIMIT 1`,
                [itemId]
            );
            if (invoiced.rowCount) throw new AppError(PURCHASE_ORDER_ERRORS.ITEM_LOCKED);
        }

        const { set, values } = buildSet(ITEM_COLUMNS, body, 3);
        const { rowCount } = await client.query(
            `UPDATE purchase_order_items SET ${set} WHERE purchase_order_item_id = $1 AND purchase_order_id = $2`,
            [itemId, purchaseOrderId, ...values]
        );
        if (rowCount === 0) throw new AppError(PURCHASE_ORDER_ERRORS.ITEM_NOT_FOUND);

        await touchOrder(client, purchaseOrderId, user.user_id);
        const detail = await loadDetail(client, projectId, purchaseOrderId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

// Las facturas y los ingresos que citan la línea la protegen con un NOT EXISTS.
export const deletePurchaseOrderItemService = async (
    user: DecodedToken, { projectId, purchaseOrderId, itemId }: PurchaseOrderItemIdParam
): Promise<PurchaseOrderDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockOrder(client, projectId, purchaseOrderId);

        const exists = await client.query(
            `SELECT 1 FROM purchase_order_items WHERE purchase_order_item_id = $1 AND purchase_order_id = $2`, [itemId, purchaseOrderId]
        );
        if (exists.rowCount === 0) throw new AppError(PURCHASE_ORDER_ERRORS.ITEM_NOT_FOUND);
        const count = await client.query<{ total: number }>(
            `SELECT COUNT(*)::int AS total FROM purchase_order_items WHERE purchase_order_id = $1`, [purchaseOrderId]
        );
        if (count.rows[0]!.total <= 1) throw new AppError(PURCHASE_ORDER_ERRORS.LAST_ITEM);

        // Ningún documento (ni las facturas dadas de baja, que se conservan) puede citarla.
        const { rowCount: deleted } = await client.query(
            `DELETE FROM purchase_order_items
            WHERE purchase_order_item_id = $1
                AND NOT EXISTS (SELECT 1 FROM invoice_items ii WHERE ii.purchase_order_item_id = $1)
                AND NOT EXISTS (SELECT 1 FROM goods_receipt_items gri WHERE gri.purchase_order_item_id = $1)`,
            [itemId]
        );
        if (deleted === 0) throw new AppError(PURCHASE_ORDER_ERRORS.ITEM_LOCKED);
        await touchOrder(client, purchaseOrderId, user.user_id);
        const detail = await loadDetail(client, projectId, purchaseOrderId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
