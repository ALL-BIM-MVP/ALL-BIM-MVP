// purchase_requisitions (Requerimiento) + sus líneas — Fase 3 de
// docs/almacen-ingreso-productos/05-roadmap.md. Registro de auditoría: no
// mueve stock. Cabecera y líneas se editan con PATCH parcial (las líneas
// tienen ids estables: los documentos siguientes las referenciarán), el
// archivo con PUT (reemplazo completo) y dar de baja exige `configure`.
import pool from "../../db/database.js";
import type { PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { PURCHASE_REQUISITION_ERRORS } from "../../models/errors/almacen/purchase-requisition.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { buildSignedFileUrl } from "../../utils/file-signing.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { assertProductInProject } from "./product.service.js";
import { buildSet } from "../../utils/partial-update.js";
import {
    lockDocument, removeFileBytes, replaceDocumentFile, softDeleteDocument, type DocumentConfig,
} from "./document-file.service.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type {
    CreatePurchaseRequisitionBody, CreatePurchaseRequisitionItemBody, ListPurchaseRequisitionsQuery,
    PurchaseRequisitionIdParam, PurchaseRequisitionItemIdParam, SetPurchaseRequisitionFileBody,
    UpdatePurchaseRequisitionBody, UpdatePurchaseRequisitionItemBody,
} from "../../schemas/almacen/purchase-requisition.schema.js";
import type {
    PurchaseRequisitionDetail, PurchaseRequisitionFile, PurchaseRequisitionItem, PurchaseRequisitionRow,
} from "../../models/almacen/purchase-requisition.models.js";

const UNIQUE_VIOLATION = "23505";

// Cabecera + conteo de líneas + si tiene archivo. Fragmento fijo del
// servidor (alias pr); el detalle agrega el archivo aparte.
const REQUISITION_SELECT = `
    SELECT pr.purchase_requisition_id, pr.project_id, pr.number,
        to_char(pr.requisition_date, 'YYYY-MM-DD') AS requisition_date,
        pr.requester, pr.notes, pr.created_at, pr.created_by, pr.updated_at, pr.updated_by,
        (SELECT COUNT(*) FROM purchase_requisition_items i
            WHERE i.purchase_requisition_id = pr.purchase_requisition_id)::int AS items_count,
        pr.file_id IS NOT NULL AS has_file
    FROM purchase_requisitions pr`;

const ITEM_SELECT = `
    SELECT i.purchase_requisition_item_id, i.purchase_requisition_id, i.product_id, i.description,
        i.quantity_requested, i.estimated_unit_price,
        json_build_object('product_id', p.product_id, 'code', p.code, 'name', p.name, 'unit', p.unit) AS product
    FROM purchase_requisition_items i
    INNER JOIN products p ON p.product_id = i.product_id`;

export const listPurchaseRequisitionsService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, { search }: ListPurchaseRequisitionsQuery
): Promise<PurchaseRequisitionRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const params: unknown[] = [projectId];
    let filter = "";
    if (search) {
        // Los comodines de LIKE que escriba el usuario (% _ \) se escapan.
        params.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
        filter = `AND (pr.number ILIKE $2 OR pr.requester ILIKE $2)`;
    }
    const { rows } = await pool.query<PurchaseRequisitionRow>(
        `${REQUISITION_SELECT}
        WHERE pr.project_id = $1 AND pr.deleted_at IS NULL ${filter}
        ORDER BY pr.requisition_date DESC, pr.purchase_requisition_id DESC`,
        params
    );
    return rows;
};

const loadDetail = async (
    client: Pick<PoolClient, "query">, projectId: number, purchaseRequisitionId: number
): Promise<PurchaseRequisitionDetail> => {
    const headerResult = await client.query<Omit<PurchaseRequisitionRow, "items_count" | "has_file">>(
        `SELECT pr.purchase_requisition_id, pr.project_id, pr.number,
            to_char(pr.requisition_date, 'YYYY-MM-DD') AS requisition_date,
            pr.requester, pr.notes, pr.created_at, pr.created_by, pr.updated_at, pr.updated_by
        FROM purchase_requisitions pr
        WHERE pr.purchase_requisition_id = $1 AND pr.project_id = $2 AND pr.deleted_at IS NULL`,
        [purchaseRequisitionId, projectId]
    );
    const header = headerResult.rows[0];
    if (!header) throw new AppError(PURCHASE_REQUISITION_ERRORS.NOT_FOUND);

    const items = await client.query<PurchaseRequisitionItem>(
        `${ITEM_SELECT} WHERE i.purchase_requisition_id = $1 ORDER BY i.purchase_requisition_item_id`,
        [purchaseRequisitionId]
    );
    const fileResult = await client.query<Omit<PurchaseRequisitionFile, "url">>(
        `SELECT f.file_id, f.name, f.mime_type, f.file_size
        FROM purchase_requisitions pr INNER JOIN files f ON f.file_id = pr.file_id
        WHERE pr.purchase_requisition_id = $1`,
        [purchaseRequisitionId]
    );
    const file = fileResult.rows[0];

    return {
        ...header,
        items: items.rows,
        file: file ? { ...file, url: buildSignedFileUrl(file.file_id, "content") } : null,
    };
};

export const getPurchaseRequisitionByIdService = async (
    user: DecodedToken, { projectId, purchaseRequisitionId }: PurchaseRequisitionIdParam
): Promise<PurchaseRequisitionDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return loadDetail(pool, projectId, purchaseRequisitionId);
};

// Los productos de las líneas tienen que ser de este proyecto y estar
// activos, antes de insertar nada.
const assertItemProducts = async (
    client: PoolClient, projectId: number, items: { product_id: number }[]
): Promise<void> => {
    for (const item of items) await assertProductInProject(client, projectId, item.product_id);
};

const insertItem = async (client: PoolClient, purchaseRequisitionId: number, item: CreatePurchaseRequisitionItemBody) => {
    await client.query(
        `INSERT INTO purchase_requisition_items
            (purchase_requisition_id, product_id, description, quantity_requested, estimated_unit_price)
        VALUES ($1, $2, $3, $4, $5)`,
        [purchaseRequisitionId, item.product_id, item.description, item.quantity_requested,
            item.estimated_unit_price ?? null]
    );
};

export const createPurchaseRequisitionService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreatePurchaseRequisitionBody
): Promise<PurchaseRequisitionDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await assertItemProducts(client, projectId, body.items);

        const { rows } = await client.query<{ purchase_requisition_id: number }>(
            `INSERT INTO purchase_requisitions (project_id, number, requisition_date, requester, notes, created_by)
            VALUES ($1, $2, $3::date, $4, $5, $6) RETURNING purchase_requisition_id`,
            [projectId, body.number, body.requisition_date, body.requester, body.notes ?? null, user.user_id]
        );
        const purchaseRequisitionId = rows[0]!.purchase_requisition_id;
        for (const item of body.items) await insertItem(client, purchaseRequisitionId, item);

        const detail = await loadDetail(client, projectId, purchaseRequisitionId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
            throw new AppError(PURCHASE_REQUISITION_ERRORS.DUPLICATE_NUMBER);
        }
        throw error;
    } finally {
        client.release();
    }
};

const HEADER_COLUMNS = ["number", "requisition_date", "requester", "notes"] as const;

export const updatePurchaseRequisitionService = async (
    user: DecodedToken, { projectId, purchaseRequisitionId }: PurchaseRequisitionIdParam,
    body: UpdatePurchaseRequisitionBody
): Promise<PurchaseRequisitionDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const { set, values } = buildSet(HEADER_COLUMNS, body, 4);
    try {
        const { rowCount } = await pool.query(
            `UPDATE purchase_requisitions SET ${set}, updated_at = NOW(), updated_by = $3
            WHERE purchase_requisition_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
            [purchaseRequisitionId, projectId, user.user_id, ...values]
        );
        if (rowCount === 0) throw new AppError(PURCHASE_REQUISITION_ERRORS.NOT_FOUND);
    } catch (error) {
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
            throw new AppError(PURCHASE_REQUISITION_ERRORS.DUPLICATE_NUMBER);
        }
        throw error;
    }
    return loadDetail(pool, projectId, purchaseRequisitionId);
};

const REQUISITION_DOC: DocumentConfig = {
    table: "purchase_requisitions",
    idColumn: "purchase_requisition_id",
    notFoundError: PURCHASE_REQUISITION_ERRORS.NOT_FOUND,
};
const lockRequisition = (client: PoolClient, projectId: number, purchaseRequisitionId: number) =>
    lockDocument(client, REQUISITION_DOC, projectId, purchaseRequisitionId);

const touchRequisition = (client: PoolClient, purchaseRequisitionId: number, userId: number) =>
    client.query(
        `UPDATE purchase_requisitions SET updated_at = NOW(), updated_by = $2 WHERE purchase_requisition_id = $1`,
        [purchaseRequisitionId, userId]
    );

// Dar de baja exige `configure` (la auditoría no la elimina un Editor) y
// elimina también el archivo físico: la fila del documento queda (baja
// lógica) sin archivo, y su número queda libre.
export const deletePurchaseRequisitionService = async (
    user: DecodedToken, { projectId, purchaseRequisitionId }: PurchaseRequisitionIdParam
): Promise<void> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "configure");

    const client = await pool.connect();
    let removed = null;
    try {
        await client.query("BEGIN");
        await lockRequisition(client, projectId, purchaseRequisitionId);
        // Un requerimiento con cotizaciones u órdenes activas no se da de baja: se dan de
        // baja primero ellas. (El bloqueo de arriba serializa contra crear una
        // cotización, que toma el requerimiento con FOR SHARE.)
        const quoted = await client.query(
            `SELECT 1 FROM quotations WHERE purchase_requisition_id = $1 AND deleted_at IS NULL
            UNION ALL
            SELECT 1 FROM purchase_orders WHERE purchase_requisition_id = $1 AND deleted_at IS NULL
            LIMIT 1`,
            [purchaseRequisitionId]
        );
        if (quoted.rowCount) throw new AppError(PURCHASE_REQUISITION_ERRORS.HAS_DOCUMENTS);
        removed = await softDeleteDocument(client, REQUISITION_DOC, projectId, purchaseRequisitionId, user.user_id);
        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
    await removeFileBytes(removed);
};

// PUT: reemplazo completo del archivo. file_id = null lo quita. El archivo
// anterior se elimina del sistema (no queda un archivo sin dueño).
export const setPurchaseRequisitionFileService = async (
    user: DecodedToken, { projectId, purchaseRequisitionId }: PurchaseRequisitionIdParam,
    { file_id: newFileId }: SetPurchaseRequisitionFileBody
): Promise<PurchaseRequisitionDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    let removed = null;
    try {
        await client.query("BEGIN");
        removed = await replaceDocumentFile(client, REQUISITION_DOC, projectId, purchaseRequisitionId, user.user_id, newFileId);
        const detail = await loadDetail(client, projectId, purchaseRequisitionId);
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

export const addPurchaseRequisitionItemService = async (
    user: DecodedToken, { projectId, purchaseRequisitionId }: PurchaseRequisitionIdParam,
    body: CreatePurchaseRequisitionItemBody
): Promise<PurchaseRequisitionDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockRequisition(client, projectId, purchaseRequisitionId);
        await assertItemProducts(client, projectId, [body]);
        await insertItem(client, purchaseRequisitionId, body);
        await touchRequisition(client, purchaseRequisitionId, user.user_id);
        const detail = await loadDetail(client, projectId, purchaseRequisitionId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

const ITEM_COLUMNS = ["product_id", "description", "quantity_requested", "estimated_unit_price"] as const;

export const updatePurchaseRequisitionItemService = async (
    user: DecodedToken, { projectId, purchaseRequisitionId, itemId }: PurchaseRequisitionItemIdParam,
    body: UpdatePurchaseRequisitionItemBody
): Promise<PurchaseRequisitionDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockRequisition(client, projectId, purchaseRequisitionId);
        if (body.product_id !== undefined) await assertProductInProject(client, projectId, body.product_id);

        // Cantidad y producto son lo que las cotizaciones y órdenes ya tomaron: con
        // una cotización u orden ACTIVA sobre esta línea no cambian (la descripción y el
        // precio estimado sí). Las líneas de cotizaciones dadas de baja no cuentan.
        if (body.quantity_requested !== undefined || body.product_id !== undefined) {
            const quoted = await client.query(
                `SELECT 1 FROM quotation_items qi INNER JOIN quotations q ON q.quotation_id = qi.quotation_id
                WHERE qi.purchase_requisition_item_id = $1 AND q.deleted_at IS NULL
                UNION ALL
                SELECT 1 FROM purchase_order_items poi INNER JOIN purchase_orders po ON po.purchase_order_id = poi.purchase_order_id
                WHERE poi.purchase_requisition_item_id = $1 AND po.deleted_at IS NULL
                LIMIT 1`,
                [itemId]
            );
            if (quoted.rowCount) throw new AppError(PURCHASE_REQUISITION_ERRORS.ITEM_LOCKED);
        }

        const { set, values } = buildSet(ITEM_COLUMNS, body, 3);
        const { rowCount } = await client.query(
            `UPDATE purchase_requisition_items SET ${set}
            WHERE purchase_requisition_item_id = $1 AND purchase_requisition_id = $2`,
            [itemId, purchaseRequisitionId, ...values]
        );
        if (rowCount === 0) throw new AppError(PURCHASE_REQUISITION_ERRORS.ITEM_NOT_FOUND);

        await touchRequisition(client, purchaseRequisitionId, user.user_id);
        const detail = await loadDetail(client, projectId, purchaseRequisitionId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

// Cuando existan documentos que referencien la línea (cotizaciones, fases
// siguientes), aquí se bloquea quitarla con un NOT EXISTS, como el candado
// del RUC de los proveedores.
export const deletePurchaseRequisitionItemService = async (
    user: DecodedToken, { projectId, purchaseRequisitionId, itemId }: PurchaseRequisitionItemIdParam
): Promise<PurchaseRequisitionDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockRequisition(client, projectId, purchaseRequisitionId);

        const count = await client.query<{ total: number }>(
            `SELECT COUNT(*)::int AS total FROM purchase_requisition_items WHERE purchase_requisition_id = $1`,
            [purchaseRequisitionId]
        );
        const exists = await client.query(
            `SELECT 1 FROM purchase_requisition_items
            WHERE purchase_requisition_item_id = $1 AND purchase_requisition_id = $2`,
            [itemId, purchaseRequisitionId]
        );
        if (exists.rowCount === 0) throw new AppError(PURCHASE_REQUISITION_ERRORS.ITEM_NOT_FOUND);
        if (count.rows[0]!.total <= 1) throw new AppError(PURCHASE_REQUISITION_ERRORS.LAST_ITEM);

        // Ningún documento (ni los dados de baja, que se conservan) puede referirla.
        const { rowCount: deleted } = await client.query(
            `DELETE FROM purchase_requisition_items
            WHERE purchase_requisition_item_id = $1
                AND NOT EXISTS (SELECT 1 FROM quotation_items qi WHERE qi.purchase_requisition_item_id = $1)
                AND NOT EXISTS (SELECT 1 FROM purchase_order_items poi WHERE poi.purchase_requisition_item_id = $1)`,
            [itemId]
        );
        if (deleted === 0) throw new AppError(PURCHASE_REQUISITION_ERRORS.ITEM_LOCKED);
        await touchRequisition(client, purchaseRequisitionId, user.user_id);
        const detail = await loadDetail(client, projectId, purchaseRequisitionId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
