// quotations (Cotización) + sus líneas — Fase 4 de
// docs/almacen-ingreso-productos/05-roadmap.md. Registro de auditoría: no
// mueve stock ni elige proveedor. Mismo patrón que purchase-requisition.service.ts
// (PATCH parcial de cabecera y líneas con ids estables, archivo con PUT, baja
// con `configure` que elimina también el archivo).
import pool from "../../db/database.js";
import type { PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { QUOTATION_ERRORS } from "../../models/errors/almacen/quotation.errors.js";
import { PURCHASE_REQUISITION_ERRORS } from "../../models/errors/almacen/purchase-requisition.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { buildSet } from "../../utils/partial-update.js";
import { buildSignedFileUrl } from "../../utils/file-signing.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { assertSupplierInProject } from "./supplier.service.js";
import {
    lockDocument, removeFileBytes, replaceDocumentFile, softDeleteDocument, type DocumentConfig,
} from "./document-file.service.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type {
    CreateQuotationBody, CreateQuotationItemBody, ListQuotationsQuery, QuotationIdParam, QuotationItemIdParam,
    SetQuotationFileBody, UpdateQuotationBody, UpdateQuotationItemBody,
} from "../../schemas/almacen/quotation.schema.js";
import type { QuotationDetail, QuotationFile, QuotationItem, QuotationRow } from "../../models/almacen/quotation.models.js";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const NUMBER_INDEX = "idx_un_quotations_number_active";

const QUOTATION_DOC: DocumentConfig = {
    table: "quotations",
    idColumn: "quotation_id",
    notFoundError: QUOTATION_ERRORS.NOT_FOUND,
};
const lockQuotation = (client: PoolClient, projectId: number, quotationId: number) =>
    lockDocument(client, QUOTATION_DOC, projectId, quotationId);

// Columnas de la cabecera con el proveedor y el requerimiento embebidos y la
// suma de las líneas. Fragmento fijo del servidor (alias q).
const HEADER_COLUMNS_SQL = `
    q.quotation_id, q.project_id, q.number, to_char(q.quotation_date, 'YYYY-MM-DD') AS quotation_date,
    q.currency, q.commercial_terms, to_char(q.valid_until, 'YYYY-MM-DD') AS valid_until, q.total_amount,
    (SELECT COALESCE(SUM(i.line_total), 0) FROM quotation_items i WHERE i.quotation_id = q.quotation_id) AS lines_total,
    json_build_object('supplier_id', s.supplier_id, 'ruc', s.ruc, 'name', s.name) AS supplier,
    json_build_object('purchase_requisition_id', pr.purchase_requisition_id, 'number', pr.number) AS purchase_requisition,
    q.created_at, q.created_by, q.updated_at, q.updated_by`;
const HEADER_FROM_SQL = `
    FROM quotations q
    INNER JOIN suppliers s ON s.supplier_id = q.supplier_id
    INNER JOIN purchase_requisitions pr ON pr.purchase_requisition_id = q.purchase_requisition_id`;

const ITEM_SELECT = `
    SELECT i.quotation_item_id, i.quotation_id, i.purchase_requisition_item_id, i.product_id, i.description,
        i.quantity_quoted, i.unit_price, i.discount_amount, i.tax_amount, i.line_total, i.notes,
        json_build_object('product_id', p.product_id, 'code', p.code, 'name', p.name, 'unit', p.unit) AS product,
        json_build_object('purchase_requisition_item_id', ri.purchase_requisition_item_id,
            'description', ri.description, 'quantity_requested', ri.quantity_requested::text) AS requisition_item
    FROM quotation_items i
    INNER JOIN products p ON p.product_id = i.product_id
    INNER JOIN purchase_requisition_items ri ON ri.purchase_requisition_item_id = i.purchase_requisition_item_id`;

export const listQuotationsService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, query: ListQuotationsQuery
): Promise<QuotationRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const params: unknown[] = [projectId, query.purchase_requisition_id ?? null, query.supplier_id ?? null];
    let filter = "";
    if (query.search) {
        // Los comodines de LIKE que escriba el usuario (% _ \) se escapan.
        params.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filter = `AND (q.number ILIKE $4 OR s.name ILIKE $4)`;
    }
    const { rows } = await pool.query<QuotationRow>(
        `SELECT ${HEADER_COLUMNS_SQL},
            (SELECT COUNT(*) FROM quotation_items i WHERE i.quotation_id = q.quotation_id)::int AS items_count,
            q.file_id IS NOT NULL AS has_file
        ${HEADER_FROM_SQL}
        WHERE q.project_id = $1 AND q.deleted_at IS NULL
            AND ($2::bigint IS NULL OR q.purchase_requisition_id = $2)
            AND ($3::int IS NULL OR q.supplier_id = $3) ${filter}
        ORDER BY q.quotation_date DESC, q.quotation_id DESC`,
        params
    );
    return rows;
};

const loadDetail = async (
    client: Pick<PoolClient, "query">, projectId: number, quotationId: number
): Promise<QuotationDetail> => {
    const headerResult = await client.query<Omit<QuotationDetail, "items" | "file">>(
        `SELECT ${HEADER_COLUMNS_SQL} ${HEADER_FROM_SQL}
        WHERE q.quotation_id = $1 AND q.project_id = $2 AND q.deleted_at IS NULL`,
        [quotationId, projectId]
    );
    const header = headerResult.rows[0];
    if (!header) throw new AppError(QUOTATION_ERRORS.NOT_FOUND);

    const items = await client.query<QuotationItem>(
        `${ITEM_SELECT} WHERE i.quotation_id = $1 ORDER BY i.quotation_item_id`, [quotationId]
    );
    const fileResult = await client.query<Omit<QuotationFile, "url">>(
        `SELECT f.file_id, f.name, f.mime_type, f.file_size
        FROM quotations q INNER JOIN files f ON f.file_id = q.file_id WHERE q.quotation_id = $1`,
        [quotationId]
    );
    const file = fileResult.rows[0];

    return {
        ...header,
        items: items.rows,
        file: file ? { ...file, url: buildSignedFileUrl(file.file_id, "content") } : null,
    };
};

export const getQuotationByIdService = async (
    user: DecodedToken, { projectId, quotationId }: QuotationIdParam
): Promise<QuotationDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return loadDetail(pool, projectId, quotationId);
};

// La línea del requerimiento tiene que ser de ESTE requerimiento; devuelve su
// producto, que es el que usa la línea cotizada. Si el cliente envió un
// product_id, tiene que coincidir.
const resolveRequisitionItemProduct = async (
    client: PoolClient, purchaseRequisitionId: number, item: Pick<CreateQuotationItemBody, "purchase_requisition_item_id" | "product_id">
): Promise<number> => {
    const { rows } = await client.query<{ product_id: number }>(
        `SELECT product_id FROM purchase_requisition_items
        WHERE purchase_requisition_item_id = $1 AND purchase_requisition_id = $2`,
        [item.purchase_requisition_item_id, purchaseRequisitionId]
    );
    if (!rows[0]) throw new AppError(QUOTATION_ERRORS.REQUISITION_ITEM_NOT_IN_REQUISITION);
    // BIGINT llega como string desde pg: se compara como texto.
    if (item.product_id !== undefined && String(item.product_id) !== String(rows[0].product_id)) {
        throw new AppError(QUOTATION_ERRORS.PRODUCT_MISMATCH);
    }
    return rows[0].product_id;
};

const insertItem = async (
    client: PoolClient, quotationId: number, purchaseRequisitionId: number, item: CreateQuotationItemBody
) => {
    const productId = await resolveRequisitionItemProduct(client, purchaseRequisitionId, item);
    await client.query(
        `INSERT INTO quotation_items
            (quotation_id, purchase_requisition_item_id, product_id, description, quantity_quoted,
             unit_price, discount_amount, tax_amount, line_total, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [quotationId, item.purchase_requisition_item_id, productId, item.description, item.quantity_quoted,
            item.unit_price ?? null, item.discount_amount ?? null, item.tax_amount ?? null, item.line_total,
            item.notes ?? null]
    );
};

// Traduce los errores de restricción de la base a los del dominio.
const mapWriteError = (error: unknown): never => {
    const { code, constraint } = error as { code?: string; constraint?: string };
    if (code === UNIQUE_VIOLATION) {
        throw new AppError(constraint === NUMBER_INDEX ? QUOTATION_ERRORS.DUPLICATE_NUMBER : QUOTATION_ERRORS.DUPLICATE_REQUISITION_ITEM);
    }
    if (code === CHECK_VIOLATION && constraint === "chk_quotations_valid_until") {
        throw new AppError(QUOTATION_ERRORS.INVALID_VALIDITY_DATE);
    }
    throw error;
};

export const createQuotationService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreateQuotationBody
): Promise<QuotationDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await assertSupplierInProject(client, projectId, body.supplier_id);
        const requisition = await client.query(
            `SELECT 1 FROM purchase_requisitions
            WHERE purchase_requisition_id = $1 AND project_id = $2 AND deleted_at IS NULL FOR SHARE`,
            [body.purchase_requisition_id, projectId]
        );
        if (requisition.rowCount === 0) throw new AppError(PURCHASE_REQUISITION_ERRORS.NOT_FOUND);

        const { rows } = await client.query<{ quotation_id: number }>(
            `INSERT INTO quotations
                (project_id, supplier_id, purchase_requisition_id, number, quotation_date, currency,
                 commercial_terms, valid_until, total_amount, created_by)
            VALUES ($1,$2,$3,$4,$5::date,$6,$7,$8::date,$9,$10) RETURNING quotation_id`,
            [projectId, body.supplier_id, body.purchase_requisition_id, body.number, body.quotation_date, body.currency,
                body.commercial_terms ?? null, body.valid_until ?? null, body.total_amount ?? null, user.user_id]
        );
        const quotationId = rows[0]!.quotation_id;
        for (const item of body.items) await insertItem(client, quotationId, body.purchase_requisition_id, item);

        const detail = await loadDetail(client, projectId, quotationId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        return mapWriteError(error);
    } finally {
        client.release();
    }
};

const HEADER_COLUMNS = ["number", "quotation_date", "currency", "commercial_terms", "valid_until", "total_amount"] as const;

export const updateQuotationService = async (
    user: DecodedToken, { projectId, quotationId }: QuotationIdParam, body: UpdateQuotationBody
): Promise<QuotationDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const { set, values } = buildSet(HEADER_COLUMNS, body, 4);
    try {
        const { rowCount } = await pool.query(
            `UPDATE quotations SET ${set}, updated_at = NOW(), updated_by = $3
            WHERE quotation_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
            [quotationId, projectId, user.user_id, ...values]
        );
        if (rowCount === 0) throw new AppError(QUOTATION_ERRORS.NOT_FOUND);
    } catch (error) {
        if (error instanceof AppError) throw error;
        mapWriteError(error);
    }
    return loadDetail(pool, projectId, quotationId);
};

const touchQuotation = (client: PoolClient, quotationId: number, userId: number) =>
    client.query(`UPDATE quotations SET updated_at = NOW(), updated_by = $2 WHERE quotation_id = $1`, [quotationId, userId]);

// Dar de baja exige `configure` (la auditoría no la elimina un Editor) y
// elimina también el archivo físico. Sus líneas quedan (auditoría).
export const deleteQuotationService = async (
    user: DecodedToken, { projectId, quotationId }: QuotationIdParam
): Promise<void> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "configure");

    const client = await pool.connect();
    let removed = null;
    try {
        await client.query("BEGIN");
        removed = await softDeleteDocument(client, QUOTATION_DOC, projectId, quotationId, user.user_id);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
    await removeFileBytes(removed);
};

export const setQuotationFileService = async (
    user: DecodedToken, { projectId, quotationId }: QuotationIdParam, { file_id: newFileId }: SetQuotationFileBody
): Promise<QuotationDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    let removed = null;
    try {
        await client.query("BEGIN");
        removed = await replaceDocumentFile(client, QUOTATION_DOC, projectId, quotationId, user.user_id, newFileId);
        const detail = await loadDetail(client, projectId, quotationId);
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

export const addQuotationItemService = async (
    user: DecodedToken, { projectId, quotationId }: QuotationIdParam, body: CreateQuotationItemBody
): Promise<QuotationDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockQuotation(client, projectId, quotationId);
        const { rows } = await client.query<{ purchase_requisition_id: number }>(
            `SELECT purchase_requisition_id FROM quotations WHERE quotation_id = $1`, [quotationId]
        );
        // FOR SHARE: no se cotiza una línea mientras el requerimiento se edita o se da de baja.
        await client.query(
            `SELECT 1 FROM purchase_requisitions WHERE purchase_requisition_id = $1 FOR SHARE`,
            [rows[0]!.purchase_requisition_id]
        );
        await insertItem(client, quotationId, rows[0]!.purchase_requisition_id, body);
        await touchQuotation(client, quotationId, user.user_id);
        const detail = await loadDetail(client, projectId, quotationId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        return mapWriteError(error);
    } finally {
        client.release();
    }
};

const ITEM_COLUMNS = ["description", "quantity_quoted", "unit_price", "discount_amount", "tax_amount", "line_total", "notes"] as const;

export const updateQuotationItemService = async (
    user: DecodedToken, { projectId, quotationId, itemId }: QuotationItemIdParam, body: UpdateQuotationItemBody
): Promise<QuotationDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockQuotation(client, projectId, quotationId);

        const { set, values } = buildSet(ITEM_COLUMNS, body, 3);
        const { rowCount } = await client.query(
            `UPDATE quotation_items SET ${set} WHERE quotation_item_id = $1 AND quotation_id = $2`,
            [itemId, quotationId, ...values]
        );
        if (rowCount === 0) throw new AppError(QUOTATION_ERRORS.ITEM_NOT_FOUND);

        await touchQuotation(client, quotationId, user.user_id);
        const detail = await loadDetail(client, projectId, quotationId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

// Cuando existan órdenes de compra que referencien la línea, aquí se bloquea
// quitarla con un NOT EXISTS (mismo patrón que el candado de las líneas del
// requerimiento).
export const deleteQuotationItemService = async (
    user: DecodedToken, { projectId, quotationId, itemId }: QuotationItemIdParam
): Promise<QuotationDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockQuotation(client, projectId, quotationId);

        const exists = await client.query(
            `SELECT 1 FROM quotation_items WHERE quotation_item_id = $1 AND quotation_id = $2`, [itemId, quotationId]
        );
        if (exists.rowCount === 0) throw new AppError(QUOTATION_ERRORS.ITEM_NOT_FOUND);
        const count = await client.query<{ total: number }>(
            `SELECT COUNT(*)::int AS total FROM quotation_items WHERE quotation_id = $1`, [quotationId]
        );
        if (count.rows[0]!.total <= 1) throw new AppError(QUOTATION_ERRORS.LAST_ITEM);

        await client.query(`DELETE FROM quotation_items WHERE quotation_item_id = $1`, [itemId]);
        await touchQuotation(client, quotationId, user.user_id);
        const detail = await loadDetail(client, projectId, quotationId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
