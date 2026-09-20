// goods_receipts (Ingreso) — ver
// docs/roadmap/almacen-bim-base-datos.md 4.1-4.3. Importa de
// product.service.ts/bin.service.ts (validar identidad) y
// inventory-movement.service.ts (aplicar cada reparto) — ninguno de
// esos importa de acá, no hay ciclo.
import pool from "../../db/database.js";
import type { PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { GOODS_RECEIPT_ERRORS } from "../../models/errors/almacen/goods-receipt.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { assertProductInProject } from "./product.service.js";
import { buildSet } from "../../utils/partial-update.js";
import { getPurchaseOrderItemStatus, getReceiptStatus } from "./document-status.service.js";
import { getItemAdjustmentSummaries } from "./adjustment-summary.service.js";
import { INVENTORY_ADJUSTMENT_ERRORS } from "../../models/errors/almacen/inventory-adjustment.errors.js";
import { containsPattern } from "../../utils/like-search.js";
import { buildSignedFileUrl } from "../../utils/file-signing.js";
import { PURCHASE_ORDER_ERRORS } from "../../models/errors/almacen/purchase-order.errors.js";
import {
    lockDocument, removeFileBytes, replaceDocumentFile, type DocumentConfig,
} from "./document-file.service.js";
import { assertBinInProject } from "./bin.service.js";
import { assertSupplierInProject } from "./supplier.service.js";
import { applyStockMovement } from "./inventory-movement.service.js";
import type {
    CreateGoodsReceiptBody, GoodsReceiptIdParam, LinkGoodsReceiptPurchaseOrderBody, ListGoodsReceiptsQuery,
    SetGoodsReceiptFileBody, UpdateGoodsReceiptBody,
} from "../../schemas/almacen/goods-receipt.schema.js";
import type {
    GoodsReceiptDetail, GoodsReceiptFile, GoodsReceiptItemLocationRow, GoodsReceiptItemRow, GoodsReceiptRow,
} from "../../models/almacen/goods-receipt.models.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";

const UNIQUE_VIOLATION = "23505";

// Los ingresos NO tienen baja lógica (son inmutables en lo físico): el ayudante de
// archivo documental no filtra por deleted_at.
const RECEIPT_DOC: DocumentConfig = {
    table: "goods_receipts",
    idColumn: "goods_receipt_id",
    notFoundError: GOODS_RECEIPT_ERRORS.NOT_FOUND,
    softDelete: false,
};

// Columnas del ingreso + su proveedor y su orden embebidos (json_build_object): el
// RUC y el nombre salen de `suppliers`, el ingreso solo guarda supplier_id;
// purchase_order es null si no cita orden. Fragmento fijo del servidor; usa el
// alias gr.
const GOODS_RECEIPT_SELECT = `
    SELECT gr.goods_receipt_id, gr.project_id,
        json_build_object('supplier_id', s.supplier_id, 'ruc', s.ruc, 'name', s.name) AS supplier,
        gr.entry_type,
        CASE WHEN o.purchase_order_id IS NULL THEN NULL
            ELSE json_build_object('purchase_order_id', o.purchase_order_id, 'number', o.number) END AS purchase_order,
        gr.delivery_note_series, gr.delivery_note_number,
        to_char(gr.delivery_note_date, 'YYYY-MM-DD') AS delivery_note_date,
        to_char(gr.received_date, 'YYYY-MM-DD') AS received_date,
        gr.file_id IS NOT NULL AS has_file,
        gr.voided_at IS NOT NULL AS voided, gr.voided_at,
        gr.created_at, gr.created_by, gr.updated_at, gr.updated_by
    FROM goods_receipts gr
    INNER JOIN suppliers s ON s.supplier_id = gr.supplier_id
    LEFT JOIN purchase_orders o ON o.purchase_order_id = gr.purchase_order_id`;

export const listGoodsReceiptsService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, query: ListGoodsReceiptsQuery
): Promise<GoodsReceiptRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const params: unknown[] = [
        projectId, query.supplier_id ?? null, query.purchase_order_id ?? null, query.entry_type ?? null,
    ];
    let filter = "";
    if (query.search) {
        // Busca por "serie-número" de la guía (T001-123, o solo 123) o por nombre del proveedor.
        params.push(containsPattern(query.search));
        filter = `AND (concat(gr.delivery_note_series, '-', gr.delivery_note_number) ILIKE $5 OR s.name ILIKE $5)`;
    }
    const { rows } = await pool.query<Omit<GoodsReceiptRow, "documents" | "alerts">>(
        `${GOODS_RECEIPT_SELECT}
        WHERE gr.project_id = $1
            AND ($2::int IS NULL OR gr.supplier_id = $2)
            AND ($3::bigint IS NULL OR gr.purchase_order_id = $3)
            AND ($4::text IS NULL OR gr.entry_type = $4) ${filter}
        ORDER BY gr.created_at DESC`,
        params
    );
    // Estado derivado (Fase 8): el "expediente" de cada ingreso y sus avisos (una sola consulta).
    const status = await getReceiptStatus(pool, rows.map((r) => r.goods_receipt_id));
    return rows.map((r) => ({ ...r, ...status.get(String(r.goods_receipt_id))! }));
};

const loadDetail = async (
    client: Pick<PoolClient, "query">, projectId: number, goodsReceiptId: number
): Promise<GoodsReceiptDetail> => {
    const headerResult = await client.query<Omit<GoodsReceiptRow, "documents" | "alerts">>(
        `${GOODS_RECEIPT_SELECT} WHERE gr.goods_receipt_id = $1 AND gr.project_id = $2`,
        [goodsReceiptId, projectId]
    );
    const header = headerResult.rows[0];
    if (!header) throw new AppError(GOODS_RECEIPT_ERRORS.NOT_FOUND);

    const itemsResult = await client.query<Omit<GoodsReceiptItemRow, "purchase_order_progress" | "alerts">>(
        `SELECT gri.*,
            CASE WHEN oi.purchase_order_item_id IS NULL THEN NULL
                ELSE json_build_object('purchase_order_item_id', oi.purchase_order_item_id, 'description', oi.description,
                    'quantity_ordered', oi.quantity_ordered::text) END AS purchase_order_item
        FROM goods_receipt_items gri
        LEFT JOIN purchase_order_items oi ON oi.purchase_order_item_id = gri.purchase_order_item_id
        WHERE gri.goods_receipt_id = $1 ORDER BY gri.goods_receipt_item_id`,
        [goodsReceiptId]
    );
    const locationsResult = await client.query<GoodsReceiptItemLocationRow>(
        `SELECT girl.* FROM goods_receipt_item_locations girl
        INNER JOIN goods_receipt_items gri ON gri.goods_receipt_item_id = girl.goods_receipt_item_id
        WHERE gri.goods_receipt_id = $1
        ORDER BY girl.goods_receipt_item_location_id`,
        [goodsReceiptId]
    );
    const fileResult = await client.query<Omit<GoodsReceiptFile, "url">>(
        `SELECT f.file_id, f.name, f.mime_type, f.file_size
        FROM goods_receipts gr INNER JOIN files f ON f.file_id = gr.file_id WHERE gr.goods_receipt_id = $1`,
        [goodsReceiptId]
    );
    const file = fileResult.rows[0];

    // Estado derivado (Fase 8): expediente del ingreso y avance ACUMULADO de la línea de orden de cada línea.
    const receiptStatus = (await getReceiptStatus(client, [goodsReceiptId])).get(String(goodsReceiptId))!;
    const orderStatus = await getPurchaseOrderItemStatus(
        client, itemsResult.rows.filter((i) => i.purchase_order_item_id != null).map((i) => i.purchase_order_item_id!)
    );

    // Ajustes (Fase 10): lo registrado no cambia; se agrega lo efectivo y dónde queda.
    const adjustments = await getItemAdjustmentSummaries(client, "goods_receipt", itemsResult.rows.map((i) => i.goods_receipt_item_id));

    const items = itemsResult.rows.map((item) => {
        const s = item.purchase_order_item_id != null ? orderStatus.get(String(item.purchase_order_item_id)) : undefined;
        return {
            ...item,
            ...adjustments.get(String(item.goods_receipt_item_id))!,
            purchase_order_progress: s?.progress ?? null,
            alerts: s ? s.alerts("receipt") : [],
            locations: locationsResult.rows.filter((loc) => loc.goods_receipt_item_id === item.goods_receipt_item_id),
        };
    });

    return {
        ...header, ...receiptStatus, items,
        file: file ? { ...file, url: buildSignedFileUrl(file.file_id, "content") } : null,
    };
};

export const getGoodsReceiptByIdService = async (
    user: DecodedToken, { projectId, goodsReceiptId }: GoodsReceiptIdParam
): Promise<GoodsReceiptDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return loadDetail(pool, projectId, goodsReceiptId);
};

// Valida la orden de compra (opcional): del proyecto, activa y del MISMO proveedor
// que el ingreso. La toma con FOR SHARE: no se edita ni se da de baja mientras se
// registra un ingreso que la cita.
const resolveOrder = async (
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
    if (String(rows[0].supplier_id) !== String(supplierId)) throw new AppError(GOODS_RECEIPT_ERRORS.SUPPLIER_MISMATCH);
    return purchaseOrderId;
};

// Producto de una línea de la orden, validando que sea de ESA orden.
const getOrderItemProduct = async (
    client: PoolClient, purchaseOrderId: number, purchaseOrderItemId: number
): Promise<number> => {
    const { rows } = await client.query<{ product_id: number }>(
        `SELECT product_id FROM purchase_order_items WHERE purchase_order_item_id = $1 AND purchase_order_id = $2`,
        [purchaseOrderItemId, purchaseOrderId]
    );
    if (!rows[0]) throw new AppError(GOODS_RECEIPT_ERRORS.LINK_INVALID);
    return rows[0].product_id;
};

// REGLA (las mismas líneas llegan hasta el almacén): si el ingreso tiene orden,
// CADA línea cita una línea de esa orden y usa su producto (si envía product_id
// debe coincidir). Sin orden no hay vínculos y la línea trae su product_id.
// Aflojarlo es quitar el bloque LINK_REQUIRED.
const resolveItemLinks = async (
    client: PoolClient, projectId: number, purchaseOrderId: number | null,
    item: { purchase_order_item_id?: number | null | undefined; product_id?: number | undefined }
): Promise<{ purchaseOrderItemId: number | null; productId: number }> => {
    if (purchaseOrderId != null) {
        if (item.purchase_order_item_id == null) throw new AppError(GOODS_RECEIPT_ERRORS.LINK_REQUIRED);
        const productId = await getOrderItemProduct(client, purchaseOrderId, item.purchase_order_item_id);
        // BIGINT llega como string desde pg: se compara como texto.
        if (item.product_id !== undefined && String(item.product_id) !== String(productId)) {
            throw new AppError(GOODS_RECEIPT_ERRORS.PRODUCT_MISMATCH);
        }
        return { purchaseOrderItemId: item.purchase_order_item_id, productId };
    }

    if (item.purchase_order_item_id != null) throw new AppError(GOODS_RECEIPT_ERRORS.LINK_INVALID);
    if (item.product_id === undefined) throw new AppError(GOODS_RECEIPT_ERRORS.PRODUCT_REQUIRED);
    await assertProductInProject(client, projectId, item.product_id);
    return { purchaseOrderItemId: null, productId: item.product_id };
};

// Sin DELETE (registro inmutable en lo físico, ver diseño 5) — crea el ingreso
// COMPLETO (header + ítems + repartos) en una sola transacción y, por cada
// reparto, aplica el movimiento real (bin_contents + inventory_movements) — no
// hay un estado "borrador" intermedio en este diseño.
export const createGoodsReceiptService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreateGoodsReceiptBody
): Promise<GoodsReceiptDetail> => {
    // Alta = "process", como todas las demás altas de este módulo.
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Validar que TODO lo referenciado exista en este proyecto antes de
        // insertar nada — mejor un 404/400 claro que una transacción a medio armar.
        await assertSupplierInProject(client, projectId, body.supplier_id);
        // Una entrada rápida no tiene documentos previos (Zod ya lo exige; aquí también).
        if (body.entry_type === "rapida" && body.purchase_order_id != null) {
            throw new AppError(GOODS_RECEIPT_ERRORS.ENTRY_TYPE_MISMATCH);
        }
        const purchaseOrderId = await resolveOrder(client, projectId, body.supplier_id, body.purchase_order_id);

        const links = [];
        for (const item of body.items) {
            links.push(await resolveItemLinks(client, projectId, purchaseOrderId, item));
            for (const location of item.locations) {
                await assertBinInProject(client, projectId, location.bin_id);
            }
        }

        const headerResult = await client.query<{ goods_receipt_id: number; received_date: string }>(
            `INSERT INTO goods_receipts
                (project_id, supplier_id, entry_type, purchase_order_id, delivery_note_series, delivery_note_number,
                 delivery_note_date, received_date, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7, COALESCE($8::date, CURRENT_DATE), $9)
            RETURNING goods_receipt_id, to_char(received_date, 'YYYY-MM-DD') AS received_date`,
            [
                projectId, body.supplier_id, body.entry_type, purchaseOrderId, body.delivery_note_series,
                body.delivery_note_number, body.delivery_note_date, body.received_date ?? null, user.user_id,
            ]
        );
        const goodsReceiptId = headerResult.rows[0]!.goods_receipt_id;
        // El default (hoy) lo resuelve la base: el Kardex usa la fecha ya guardada.
        const receivedDate = headerResult.rows[0]!.received_date;

        for (const [index, item] of body.items.entries()) {
            const link = links[index]!;
            const itemResult = await client.query<{ goods_receipt_item_id: number }>(
                `INSERT INTO goods_receipt_items
                    (goods_receipt_id, purchase_order_item_id, product_id, total_quantity, quantity_per_delivery_note)
                VALUES ($1,$2,$3,$4,$5)
                RETURNING goods_receipt_item_id`,
                [goodsReceiptId, link.purchaseOrderItemId, link.productId, item.total_quantity, item.quantity_per_delivery_note ?? null]
            );
            const goodsReceiptItemId = itemResult.rows[0]!.goods_receipt_item_id;

            for (const location of item.locations) {
                await client.query(
                    `INSERT INTO goods_receipt_item_locations (goods_receipt_item_id, bin_id, quantity)
                    VALUES ($1,$2,$3)`,
                    [goodsReceiptItemId, location.bin_id, location.quantity]
                );

                await applyStockMovement(client, {
                    productId: link.productId,
                    binId: location.bin_id,
                    quantity: location.quantity,
                    direction: "entrada",
                    referenceDocumentType: "goods_receipt",
                    referenceDocumentId: goodsReceiptId,
                    movementDate: receivedDate,
                    userId: user.user_id,
                });
            }
        }

        const detail = await loadDetail(client, projectId, goodsReceiptId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new AppError(GOODS_RECEIPT_ERRORS.DUPLICATE_DELIVERY_NOTE);
        throw error;
    } finally {
        client.release();
    }
};

const ADMIN_COLUMNS = ["delivery_note_series", "delivery_note_number", "delivery_note_date"] as const;

// Corrección ADMINISTRATIVA de la guía (serie, número, fecha de la guía), con
// auditoría. NUNCA cantidades, productos, casillas ni received_date (esos
// errores se corrigen con un movimiento nuevo, Fase 10).
export const updateGoodsReceiptService = async (
    user: DecodedToken, { projectId, goodsReceiptId }: GoodsReceiptIdParam, body: UpdateGoodsReceiptBody
): Promise<GoodsReceiptDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const { set, values } = buildSet(ADMIN_COLUMNS, body, 4);
    try {
        const { rowCount } = await pool.query(
            `UPDATE goods_receipts SET ${set}, updated_at = NOW(), updated_by = $3
            WHERE goods_receipt_id = $1 AND project_id = $2 AND voided_at IS NULL`,
            [goodsReceiptId, projectId, user.user_id, ...values]
        );
        if (rowCount === 0) {
            // No hubo fila: o no existe, o está anulado.
            const exists = await pool.query(`SELECT 1 FROM goods_receipts WHERE goods_receipt_id = $1 AND project_id = $2`, [goodsReceiptId, projectId]);
            throw new AppError(exists.rowCount ? GOODS_RECEIPT_ERRORS.ALREADY_VOIDED : GOODS_RECEIPT_ERRORS.NOT_FOUND);
        }
    } catch (error) {
        if (error instanceof AppError) throw error;
        if ((error as { code?: string }).code === UNIQUE_VIOLATION) throw new AppError(GOODS_RECEIPT_ERRORS.DUPLICATE_DELIVERY_NOTE);
        throw error;
    }
    return loadDetail(pool, projectId, goodsReceiptId);
};

// Vincula (o reemplaza) la orden de compra de un ingreso YA registrado: hay que
// indicar la línea de orden de CADA línea del ingreso. El ingreso pasa a 'normal'.
// No toca cantidades, productos ni casillas: solo el vínculo.
export const linkGoodsReceiptPurchaseOrderService = async (
    user: DecodedToken, { projectId, goodsReceiptId }: GoodsReceiptIdParam, body: LinkGoodsReceiptPurchaseOrderBody
): Promise<GoodsReceiptDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockDocument(client, RECEIPT_DOC, projectId, goodsReceiptId);
        const header = await client.query<{ supplier_id: number; voided_at: Date | null }>(
            `SELECT supplier_id, voided_at FROM goods_receipts WHERE goods_receipt_id = $1`, [goodsReceiptId]
        );
        if (header.rows[0]!.voided_at) throw new AppError(GOODS_RECEIPT_ERRORS.ALREADY_VOIDED);
        await resolveOrder(client, projectId, header.rows[0]!.supplier_id, body.purchase_order_id);

        // Tiene que indicarse la línea de orden de TODAS las líneas del ingreso, sin repetir ni omitir.
        const current = await client.query<{ goods_receipt_item_id: number; product_id: number }>(
            `SELECT goods_receipt_item_id, product_id FROM goods_receipt_items WHERE goods_receipt_id = $1`, [goodsReceiptId]
        );
        const currentIds = new Set(current.rows.map((r) => String(r.goods_receipt_item_id)));
        const sentIds = new Set(body.items.map((i) => String(i.goods_receipt_item_id)));
        if (currentIds.size !== sentIds.size || [...currentIds].some((id) => !sentIds.has(id))) {
            throw new AppError(GOODS_RECEIPT_ERRORS.LINK_ITEMS_MISMATCH);
        }

        for (const mapping of body.items) {
            const orderProduct = await getOrderItemProduct(client, body.purchase_order_id, mapping.purchase_order_item_id);
            const receiptProduct = current.rows.find((r) => String(r.goods_receipt_item_id) === String(mapping.goods_receipt_item_id))!.product_id;
            // El producto recibido no cambia: tiene que ser el de la línea de orden.
            if (String(orderProduct) !== String(receiptProduct)) throw new AppError(GOODS_RECEIPT_ERRORS.PRODUCT_MISMATCH);
            await client.query(
                `UPDATE goods_receipt_items SET purchase_order_item_id = $2 WHERE goods_receipt_item_id = $1`,
                [mapping.goods_receipt_item_id, mapping.purchase_order_item_id]
            );
        }
        await client.query(
            `UPDATE goods_receipts SET purchase_order_id = $2, entry_type = 'normal', updated_at = NOW(), updated_by = $3
            WHERE goods_receipt_id = $1`,
            [goodsReceiptId, body.purchase_order_id, user.user_id]
        );

        const detail = await loadDetail(client, projectId, goodsReceiptId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

// Adjuntar, reemplazar o quitar (file_id null) el escaneo de la guía. El archivo
// anterior se elimina del sistema (no queda un archivo sin dueño).
export const setGoodsReceiptFileService = async (
    user: DecodedToken, { projectId, goodsReceiptId }: GoodsReceiptIdParam, { file_id: newFileId }: SetGoodsReceiptFileBody
): Promise<GoodsReceiptDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    let removed = null;
    try {
        await client.query("BEGIN");
        await lockDocument(client, RECEIPT_DOC, projectId, goodsReceiptId);
        const voided = await client.query(`SELECT 1 FROM goods_receipts WHERE goods_receipt_id = $1 AND voided_at IS NOT NULL`, [goodsReceiptId]);
        if (voided.rowCount) throw new AppError(GOODS_RECEIPT_ERRORS.ALREADY_VOIDED);
        removed = await replaceDocumentFile(client, RECEIPT_DOC, projectId, goodsReceiptId, user.user_id, newFileId);
        const detail = await loadDetail(client, projectId, goodsReceiptId);
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
