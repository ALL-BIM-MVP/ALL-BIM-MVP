// invoices (Factura) + sus líneas — Fase 6 de
// docs/almacen-ingreso-productos/05-roadmap.md. Registro de auditoría: no paga
// ni concilia. Mismo patrón que purchase-order.service.ts: origen (orden de
// compra) OPCIONAL, pero si existe cada línea cita la línea de esa orden (las
// mismas líneas llegan hasta el almacén); la factura guarda su propia copia
// (snapshot) de cantidades y montos; PATCH parcial; archivo con PUT; baja con
// `configure` que elimina también el archivo.
import pool from "../../db/database.js";
import type { PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { INVOICE_ERRORS } from "../../models/errors/almacen/invoice.errors.js";
import { PURCHASE_ORDER_ERRORS } from "../../models/errors/almacen/purchase-order.errors.js";
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
    attachFileOnCreate, lockDocument, removeFileBytes, replaceDocumentFile, softDeleteDocument, type DocumentConfig,
} from "./document-file.service.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type {
    CreateInvoiceBody, CreateInvoiceItemBody, InvoiceIdParam, InvoiceItemIdParam, ListInvoicesQuery, SetInvoiceFileBody,
    UpdateInvoiceBody, UpdateInvoiceItemBody,
} from "../../schemas/almacen/invoice.schema.js";
import type { InvoiceDetail, InvoiceFile, InvoiceItem, InvoiceRow } from "../../models/almacen/invoice.models.js";
import { productSummarySql } from "../../utils/product-summary.js";

const UNIQUE_VIOLATION = "23505";

const INVOICE_DOC: DocumentConfig = {
    table: "invoices",
    idColumn: "invoice_id",
    notFoundError: INVOICE_ERRORS.NOT_FOUND,
};
const lockInvoice = (client: PoolClient, projectId: number, invoiceId: number) =>
    lockDocument(client, INVOICE_DOC, projectId, invoiceId);

// Cabecera con proveedor y orden embebidos (null si no hay) y la suma de las
// líneas. Fragmento fijo del servidor (alias v).
const HEADER_COLUMNS_SQL = `
    v.invoice_id, v.project_id, v.series, v.number, to_char(v.invoice_date, 'YYYY-MM-DD') AS invoice_date,
    v.currency, v.subtotal_amount, v.tax_amount, v.total_amount,
    (SELECT COALESCE(SUM(i.line_total), 0) FROM invoice_items i WHERE i.invoice_id = v.invoice_id) AS lines_total,
    json_build_object('supplier_id', s.supplier_id, 'ruc', s.ruc, 'name', s.name) AS supplier,
    CASE WHEN o.purchase_order_id IS NULL THEN NULL
        ELSE json_build_object('purchase_order_id', o.purchase_order_id::text, 'number', o.number) END AS purchase_order,
    v.created_at, v.created_by, v.updated_at, v.updated_by`;
const HEADER_FROM_SQL = `
    FROM invoices v
    INNER JOIN suppliers s ON s.supplier_id = v.supplier_id
    LEFT JOIN purchase_orders o ON o.purchase_order_id = v.purchase_order_id`;

const ITEM_SELECT = `
    SELECT i.invoice_item_id, i.invoice_id, i.purchase_order_item_id, i.product_id, i.description,
        i.quantity_invoiced, i.unit_price, i.discount_amount, i.tax_amount, i.line_total, i.notes,
        ${productSummarySql('p')} AS product,
        CASE WHEN oi.purchase_order_item_id IS NULL THEN NULL
            ELSE json_build_object('purchase_order_item_id', oi.purchase_order_item_id::text, 'description', oi.description,
                'quantity_ordered', oi.quantity_ordered::text) END AS purchase_order_item
    FROM invoice_items i
    INNER JOIN products p ON p.product_id = i.product_id
    LEFT JOIN purchase_order_items oi ON oi.purchase_order_item_id = i.purchase_order_item_id`;

export const listInvoicesService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, query: ListInvoicesQuery
): Promise<InvoiceRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const params: unknown[] = [projectId, query.supplier_id ?? null, query.purchase_order_id ?? null];
    let filter = "";
    if (query.search) {
        // Busca por "serie-número" (F001-123, o solo 123) o por nombre del proveedor.
        params.push(containsPattern(query.search));
        filter = `AND (concat(v.series, '-', v.number) ILIKE $4 OR s.name ILIKE $4)`;
    }
    const { rows } = await pool.query<InvoiceRow>(
        `SELECT ${HEADER_COLUMNS_SQL},
            (SELECT COUNT(*) FROM invoice_items i WHERE i.invoice_id = v.invoice_id)::int AS items_count,
            v.file_id IS NOT NULL AS has_file
        ${HEADER_FROM_SQL}
        WHERE v.project_id = $1 AND v.deleted_at IS NULL
            AND ($2::int IS NULL OR v.supplier_id = $2)
            AND ($3::bigint IS NULL OR v.purchase_order_id = $3) ${filter}
        ORDER BY v.invoice_date DESC, v.invoice_id DESC`,
        params
    );
    return rows;
};

const loadDetail = async (
    client: Pick<PoolClient, "query">, projectId: number, invoiceId: number
): Promise<InvoiceDetail> => {
    const headerResult = await client.query<Omit<InvoiceDetail, "items" | "file">>(
        `SELECT ${HEADER_COLUMNS_SQL} ${HEADER_FROM_SQL}
        WHERE v.invoice_id = $1 AND v.project_id = $2 AND v.deleted_at IS NULL`,
        [invoiceId, projectId]
    );
    const header = headerResult.rows[0];
    if (!header) throw new AppError(INVOICE_ERRORS.NOT_FOUND);

    const items = await client.query<Omit<InvoiceItem, "purchase_order_progress" | "alerts">>(
        `${ITEM_SELECT} WHERE i.invoice_id = $1 ORDER BY i.invoice_item_id`, [invoiceId]
    );
    // Estado derivado (Fase 8): avance ACUMULADO de la línea de orden que cada línea factura.
    const status = await getPurchaseOrderItemStatus(client, items.rows.filter((i) => i.purchase_order_item_id != null).map((i) => i.purchase_order_item_id!));
    const fileResult = await client.query<Omit<InvoiceFile, "url">>(
        `SELECT f.file_id, f.name, f.mime_type, f.file_size
        FROM invoices v INNER JOIN files f ON f.file_id = v.file_id WHERE v.invoice_id = $1`,
        [invoiceId]
    );
    const file = fileResult.rows[0];

    return {
        ...header,
        items: items.rows.map((i) => {
            const s = i.purchase_order_item_id != null ? status.get(String(i.purchase_order_item_id)) : undefined;
            return { ...i, purchase_order_progress: s?.progress ?? null, alerts: s ? s.alerts("invoice") : [] };
        }),
        file: file ? { ...file, url: buildSignedFileUrl(file.file_id, "content") } : null,
        alerts: file ? [] : [filePendingAlert()],
    };
};

export const getInvoiceByIdService = async (
    user: DecodedToken, { projectId, invoiceId }: InvoiceIdParam
): Promise<InvoiceDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return loadDetail(pool, projectId, invoiceId);
};

// Valida la orden de origen (opcional): del proyecto, activa y del MISMO
// proveedor que la factura. La toma con FOR SHARE: no se edita ni se da de baja
// mientras se crea una factura que la cita.
const resolveOrigin = async (
    client: PoolClient, projectId: number, supplierId: number, purchaseOrderId: number | null | undefined
): Promise<number | null> => {
    if (purchaseOrderId == null) return null;
    const { rows } = await client.query<{ supplier_id: number }>(
        `SELECT supplier_id FROM purchase_orders
        WHERE purchase_order_id = $1 AND project_id = $2 AND deleted_at IS NULL FOR SHARE`,
        [purchaseOrderId, projectId]
    );
    if (!rows[0]) throw new AppError(PURCHASE_ORDER_ERRORS.NOT_FOUND);
    // INT llega como número desde pg: se compara como texto.
    if (String(rows[0].supplier_id) !== String(supplierId)) throw new AppError(INVOICE_ERRORS.SUPPLIER_MISMATCH);
    return purchaseOrderId;
};

// REGLA (las mismas líneas llegan hasta el almacén): si la factura tiene orden,
// CADA línea cita una línea de esa orden y usa su producto (si envía product_id
// debe coincidir). Sin orden no hay vínculos y la línea trae su product_id.
// Aflojarlo es quitar el bloque LINK_REQUIRED.
const resolveItemLinks = async (
    client: PoolClient, projectId: number, purchaseOrderId: number | null, item: CreateInvoiceItemBody
): Promise<{ purchaseOrderItemId: number | null; productId: number }> => {
    if (purchaseOrderId != null) {
        if (item.purchase_order_item_id == null) throw new AppError(INVOICE_ERRORS.LINK_REQUIRED);
        const { rows } = await client.query<{ product_id: number }>(
            `SELECT product_id FROM purchase_order_items WHERE purchase_order_item_id = $1 AND purchase_order_id = $2`,
            [item.purchase_order_item_id, purchaseOrderId]
        );
        if (!rows[0]) throw new AppError(INVOICE_ERRORS.LINK_INVALID);
        // BIGINT llega como string desde pg: se compara como texto.
        if (item.product_id !== undefined && String(item.product_id) !== String(rows[0].product_id)) {
            throw new AppError(INVOICE_ERRORS.PRODUCT_MISMATCH);
        }
        return { purchaseOrderItemId: item.purchase_order_item_id, productId: rows[0].product_id };
    }

    if (item.purchase_order_item_id != null) throw new AppError(INVOICE_ERRORS.LINK_INVALID);
    if (item.product_id === undefined) throw new AppError(INVOICE_ERRORS.PRODUCT_REQUIRED);
    await assertProductInProject(client, projectId, item.product_id);
    return { purchaseOrderItemId: null, productId: item.product_id };
};

const insertItem = async (
    client: PoolClient, projectId: number, invoiceId: number, purchaseOrderId: number | null, item: CreateInvoiceItemBody
) => {
    const links = await resolveItemLinks(client, projectId, purchaseOrderId, item);
    await client.query(
        `INSERT INTO invoice_items
            (invoice_id, purchase_order_item_id, product_id, description, quantity_invoiced,
             unit_price, discount_amount, tax_amount, line_total, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [invoiceId, links.purchaseOrderItemId, links.productId, item.description, item.quantity_invoiced,
            item.unit_price ?? null, item.discount_amount ?? null, item.tax_amount ?? null, item.line_total,
            item.notes ?? null]
    );
};

export const createInvoiceService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreateInvoiceBody
): Promise<InvoiceDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await assertSupplierInProject(client, projectId, body.supplier_id);
        const purchaseOrderId = await resolveOrigin(client, projectId, body.supplier_id, body.purchase_order_id);

        const { rows } = await client.query<{ invoice_id: number }>(
            `INSERT INTO invoices
                (project_id, supplier_id, purchase_order_id, series, number, invoice_date, currency,
                 subtotal_amount, tax_amount, total_amount, created_by)
            VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9,$10,$11) RETURNING invoice_id`,
            [projectId, body.supplier_id, purchaseOrderId, body.series, body.number, body.invoice_date, body.currency,
                body.subtotal_amount ?? null, body.tax_amount ?? null, body.total_amount ?? null, user.user_id]
        );
        const invoiceId = rows[0]!.invoice_id;
        for (const item of body.items) await insertItem(client, projectId, invoiceId, purchaseOrderId, item);

                // Documento creado a partir de un archivo ya subido (lectura por IA): archivo y documento se guardan juntos.
        if (body.file_id != null) await attachFileOnCreate(client, INVOICE_DOC, projectId, invoiceId, body.file_id);

        const detail = await loadDetail(client, projectId, invoiceId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new AppError(INVOICE_ERRORS.DUPLICATE);
        throw error;
    } finally {
        client.release();
    }
};

const HEADER_COLUMNS = ["series", "number", "invoice_date", "currency", "subtotal_amount", "tax_amount", "total_amount"] as const;

export const updateInvoiceService = async (
    user: DecodedToken, { projectId, invoiceId }: InvoiceIdParam, body: UpdateInvoiceBody
): Promise<InvoiceDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const { set, values } = buildSet(HEADER_COLUMNS, body, 4);
    try {
        const { rowCount } = await pool.query(
            `UPDATE invoices SET ${set}, updated_at = NOW(), updated_by = $3
            WHERE invoice_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
            [invoiceId, projectId, user.user_id, ...values]
        );
        if (rowCount === 0) throw new AppError(INVOICE_ERRORS.NOT_FOUND);
    } catch (error) {
        if (error instanceof AppError) throw error;
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new AppError(INVOICE_ERRORS.DUPLICATE);
        throw error;
    }
    return loadDetail(pool, projectId, invoiceId);
};

const touchInvoice = (client: PoolClient, invoiceId: number, userId: number) =>
    client.query(`UPDATE invoices SET updated_at = NOW(), updated_by = $2 WHERE invoice_id = $1`, [invoiceId, userId]);

// Dar de baja exige `configure` (la auditoría no la elimina un Editor) y
// elimina también el archivo físico. Sus líneas quedan (auditoría).
export const deleteInvoiceService = async (
    user: DecodedToken, { projectId, invoiceId }: InvoiceIdParam
): Promise<void> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "configure");

    const client = await pool.connect();
    let removed = null;
    try {
        await client.query("BEGIN");
        removed = await softDeleteDocument(client, INVOICE_DOC, projectId, invoiceId, user.user_id);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
    await removeFileBytes(removed);
};

export const setInvoiceFileService = async (
    user: DecodedToken, { projectId, invoiceId }: InvoiceIdParam, { file_id: newFileId }: SetInvoiceFileBody
): Promise<InvoiceDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    let removed = null;
    try {
        await client.query("BEGIN");
        removed = await replaceDocumentFile(client, INVOICE_DOC, projectId, invoiceId, user.user_id, newFileId);
        const detail = await loadDetail(client, projectId, invoiceId);
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

export const addInvoiceItemService = async (
    user: DecodedToken, { projectId, invoiceId }: InvoiceIdParam, body: CreateInvoiceItemBody
): Promise<InvoiceDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockInvoice(client, projectId, invoiceId);
        const { rows } = await client.query<{ purchase_order_id: number | null }>(
            `SELECT purchase_order_id FROM invoices WHERE invoice_id = $1`, [invoiceId]
        );
        const purchaseOrderId = rows[0]!.purchase_order_id;
        // FOR SHARE de la orden (mismo criterio que al crear la factura).
        if (purchaseOrderId != null) {
            await client.query(`SELECT 1 FROM purchase_orders WHERE purchase_order_id = $1 FOR SHARE`, [purchaseOrderId]);
        }
        await insertItem(client, projectId, invoiceId, purchaseOrderId, body);
        await touchInvoice(client, invoiceId, user.user_id);
        const detail = await loadDetail(client, projectId, invoiceId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const ITEM_COLUMNS = ["description", "quantity_invoiced", "unit_price", "discount_amount", "tax_amount", "line_total", "notes"] as const;

export const updateInvoiceItemService = async (
    user: DecodedToken, { projectId, invoiceId, itemId }: InvoiceItemIdParam, body: UpdateInvoiceItemBody
): Promise<InvoiceDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockInvoice(client, projectId, invoiceId);

        const { set, values } = buildSet(ITEM_COLUMNS, body, 3);
        const { rowCount } = await client.query(
            `UPDATE invoice_items SET ${set} WHERE invoice_item_id = $1 AND invoice_id = $2`,
            [itemId, invoiceId, ...values]
        );
        if (rowCount === 0) throw new AppError(INVOICE_ERRORS.ITEM_NOT_FOUND);

        await touchInvoice(client, invoiceId, user.user_id);
        const detail = await loadDetail(client, projectId, invoiceId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const deleteInvoiceItemService = async (
    user: DecodedToken, { projectId, invoiceId, itemId }: InvoiceItemIdParam
): Promise<InvoiceDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockInvoice(client, projectId, invoiceId);

        const exists = await client.query(
            `SELECT 1 FROM invoice_items WHERE invoice_item_id = $1 AND invoice_id = $2`, [itemId, invoiceId]
        );
        if (exists.rowCount === 0) throw new AppError(INVOICE_ERRORS.ITEM_NOT_FOUND);
        const count = await client.query<{ total: number }>(
            `SELECT COUNT(*)::int AS total FROM invoice_items WHERE invoice_id = $1`, [invoiceId]
        );
        if (count.rows[0]!.total <= 1) throw new AppError(INVOICE_ERRORS.LAST_ITEM);

        await client.query(`DELETE FROM invoice_items WHERE invoice_item_id = $1`, [itemId]);
        await touchInvoice(client, invoiceId, user.user_id);
        const detail = await loadDetail(client, projectId, invoiceId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
