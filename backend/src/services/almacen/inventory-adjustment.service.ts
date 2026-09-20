// Ajustes de inventario (Fase 10): corrigen las cantidades de un ingreso o de un vale YA
// registrados SIN reescribirlos. El original queda igual; el ajuste es un documento nuevo,
// con motivo, cuyas líneas generan movimientos de stock normales (Kardex) por el mismo
// camino atómico que los ingresos y vales (applyStockMovement), así que el stock nunca
// queda negativo. Dos tipos: 'correccion' (cambios por línea y casilla) y 'anulacion'
// (revierte todo lo efectivo del documento y lo marca anulado). Solo el Administrador del
// módulo (configure): un Editor no altera el inventario confirmado. Un ajuste no se edita
// ni se da de baja; uno equivocado se corrige con otro.
import pool from "../../db/database.js";
import type { PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { GOODS_RECEIPT_ERRORS } from "../../models/errors/almacen/goods-receipt.errors.js";
import { GOODS_ISSUE_ERRORS } from "../../models/errors/almacen/goods-issue.errors.js";
import { INVENTORY_ADJUSTMENT_ERRORS } from "../../models/errors/almacen/inventory-adjustment.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { assertBinInProject } from "./bin.service.js";
import { applyStockMovement } from "./inventory-movement.service.js";
import { ADJUSTMENT_DOCS } from "./adjustment-summary.service.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type {
    AdjustmentIdParam, CorrectGoodsIssueBody, CorrectGoodsReceiptBody, ListAdjustmentsQuery, VoidDocumentBody,
} from "../../schemas/almacen/inventory-adjustment.schema.js";
import type { AdjustedDocumentType, AdjustmentKind, InventoryAdjustment, InventoryAdjustmentItem } from "../../models/almacen/inventory-adjustment.models.js";
import { productSummarySql } from "../../utils/product-summary.js";

interface Line { itemId: number | string; productId: number | string; binId: number; delta: number }

const NOT_FOUND = {
    goods_receipt: GOODS_RECEIPT_ERRORS.NOT_FOUND,
    goods_issue: GOODS_ISSUE_ERRORS.NOT_FOUND,
} as const;

// Bloquea el documento (FOR UPDATE: dos ajustes simultáneos no se pisan) y comprueba que
// exista en el proyecto y que no esté anulado.
const lockDocument = async (client: PoolClient, projectId: number, type: AdjustedDocumentType, documentId: number): Promise<void> => {
    const d = ADJUSTMENT_DOCS[type];
    const { rows } = await client.query<{ voided_at: Date | null }>(
        `SELECT voided_at FROM ${d.headerTable} WHERE ${d.headerIdColumn} = $1 AND project_id = $2 FOR UPDATE`,
        [documentId, projectId]
    );
    if (!rows[0]) throw new AppError(NOT_FOUND[type]);
    if (rows[0].voided_at) throw new AppError(INVENTORY_ADJUSTMENT_ERRORS.ALREADY_VOIDED);
};

// Lo efectivo de una línea en una casilla = lo registrado + los ajustes anteriores.
// `delta` se suma en SQL (NUMERIC): true si el resultado quedaría negativo.
const wouldBeNegative = async (client: PoolClient, type: AdjustedDocumentType, itemId: number | string, binId: number, delta: number): Promise<boolean> => {
    const d = ADJUSTMENT_DOCS[type];
    const { rows } = await client.query<{ negative: boolean }>(
        `SELECT (COALESCE(SUM(q), 0) + $3::numeric) < 0 AS negative FROM (
            SELECT quantity AS q FROM ${d.locationsTable} WHERE ${d.itemIdColumn} = $1 AND bin_id = $2
            UNION ALL
            SELECT quantity_delta FROM inventory_adjustment_items WHERE ${d.itemIdColumn} = $1 AND bin_id = $2
        ) t`,
        [itemId, binId, delta]
    );
    return rows[0]!.negative;
};

// Crea el ajuste y aplica sus movimientos de stock. Todo dentro de la transacción del llamador.
const applyAdjustment = async (
    client: PoolClient, userId: number, projectId: number, type: AdjustedDocumentType, documentId: number,
    kind: AdjustmentKind, reason: string, date: string | undefined, lines: Line[]
): Promise<number> => {
    const d = ADJUSTMENT_DOCS[type];
    const header = await client.query<{ id: number; date: string }>(
        `INSERT INTO inventory_adjustments (project_id, kind, reference_document_type, ${d.headerIdColumn}, reason, adjustment_date, created_by)
        VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7)
        RETURNING inventory_adjustment_id AS id, to_char(adjustment_date, 'YYYY-MM-DD') AS date`,
        [projectId, kind, type, documentId, reason, date ?? null, userId]
    );
    const adjustmentId = header.rows[0]!.id;
    const movementDate = header.rows[0]!.date;

    for (const line of lines) {
        await client.query(
            `INSERT INTO inventory_adjustment_items (inventory_adjustment_id, ${d.itemIdColumn}, product_id, bin_id, quantity_delta)
            VALUES ($1, $2, $3, $4, $5)`,
            [adjustmentId, line.itemId, line.productId, line.binId, line.delta]
        );
        // Efecto real en el stock: en un ingreso el cambio va en el mismo sentido; en un vale, al revés.
        const stockEffect = d.stockSign * line.delta;
        await applyStockMovement(client, {
            productId: line.productId as number, binId: line.binId, quantity: Math.abs(stockEffect),
            direction: stockEffect > 0 ? "entrada" : "salida",
            referenceDocumentType: "inventory_adjustment", referenceDocumentId: adjustmentId, movementDate, userId,
        });
    }
    return adjustmentId;
};

const ADJUSTMENT_HEADER_SELECT = `
    SELECT ia.inventory_adjustment_id, ia.project_id, ia.kind, ia.reference_document_type,
        COALESCE(ia.goods_receipt_id, ia.goods_issue_id) AS reference_id,
        CASE WHEN ia.reference_document_type = 'goods_receipt'
            THEN concat(gr.delivery_note_series, '-', gr.delivery_note_number) ELSE gi.number END AS reference_label,
        ia.reason, to_char(ia.adjustment_date, 'YYYY-MM-DD') AS adjustment_date, ia.created_at, ia.created_by
    FROM inventory_adjustments ia
    LEFT JOIN goods_receipts gr ON gr.goods_receipt_id = ia.goods_receipt_id
    LEFT JOIN goods_issues gi ON gi.goods_issue_id = ia.goods_issue_id`;

interface HeaderRow {
    inventory_adjustment_id: number; project_id: number; kind: AdjustmentKind; reference_document_type: AdjustedDocumentType;
    reference_id: number; reference_label: string; reason: string; adjustment_date: string; created_at: Date; created_by: number;
}

const toAdjustment = (h: HeaderRow, items: InventoryAdjustmentItem[]): InventoryAdjustment => ({
    inventory_adjustment_id: h.inventory_adjustment_id, project_id: h.project_id, kind: h.kind,
    reference_document: { type: h.reference_document_type, id: h.reference_id, label: h.reference_label },
    reason: h.reason, adjustment_date: h.adjustment_date, created_at: h.created_at, created_by: h.created_by, items,
});

const loadItems = async (client: Pick<PoolClient, "query">, adjustmentIds: (number | string)[]): Promise<Map<string, InventoryAdjustmentItem[]>> => {
    const map = new Map<string, InventoryAdjustmentItem[]>();
    if (adjustmentIds.length === 0) return map;
    const { rows } = await client.query<InventoryAdjustmentItem & { adjustment_id: string }>(
        `SELECT ai.inventory_adjustment_id AS adjustment_id, ai.inventory_adjustment_item_id,
            COALESCE(ai.goods_receipt_item_id, ai.goods_issue_item_id) AS item_id,
            ${productSummarySql('p')} AS product,
            json_build_object('bin_id', b.bin_id::text, 'label', w.name || ' · ' || r.name || ' · ' || b.location_label) AS bin,
            ai.quantity_delta::numeric(18,6)::text AS quantity_delta,
            (CASE WHEN ia.reference_document_type = 'goods_receipt' THEN ai.quantity_delta ELSE -ai.quantity_delta END)::numeric(18,6)::text AS stock_effect
        FROM inventory_adjustment_items ai
        INNER JOIN inventory_adjustments ia ON ia.inventory_adjustment_id = ai.inventory_adjustment_id
        INNER JOIN products p ON p.product_id = ai.product_id
        INNER JOIN bins b ON b.bin_id = ai.bin_id
        INNER JOIN racks r ON r.rack_id = b.rack_id
        INNER JOIN warehouses w ON w.warehouse_id = r.warehouse_id
        WHERE ai.inventory_adjustment_id = ANY($1::bigint[]) ORDER BY ai.inventory_adjustment_item_id`,
        [adjustmentIds.map(String)]
    );
    for (const { adjustment_id, ...item } of rows) {
        const list = map.get(String(adjustment_id)) ?? [];
        list.push(item);
        map.set(String(adjustment_id), list);
    }
    return map;
};

const loadDetail = async (client: Pick<PoolClient, "query">, projectId: number, adjustmentId: number): Promise<InventoryAdjustment> => {
    const header = await client.query<HeaderRow>(
        `${ADJUSTMENT_HEADER_SELECT} WHERE ia.inventory_adjustment_id = $1 AND ia.project_id = $2`, [adjustmentId, projectId]
    );
    if (!header.rows[0]) throw new AppError(INVENTORY_ADJUSTMENT_ERRORS.NOT_FOUND);
    const items = await loadItems(client, [adjustmentId]);
    return toAdjustment(header.rows[0], items.get(String(adjustmentId)) ?? []);
};

// ---------------------------------------------------------------------------------------------
// Corrección de cantidades
// ---------------------------------------------------------------------------------------------
const correct = async (
    user: DecodedToken, projectId: number, type: AdjustedDocumentType, documentId: number,
    body: { reason: string; adjustment_date?: string | undefined; items: { itemId: number; bin_id: number; quantity_delta: number }[] }
): Promise<InventoryAdjustment> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "configure");
    const d = ADJUSTMENT_DOCS[type];

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockDocument(client, projectId, type, documentId);

        const lines: Line[] = [];
        for (const item of body.items) {
            // La línea tiene que ser de ESTE documento; el producto es el de la línea.
            const found = await client.query<{ product_id: number }>(
                `SELECT product_id FROM ${d.itemsTable} WHERE ${d.itemIdColumn} = $1 AND ${d.headerIdColumn} = $2`, [item.itemId, documentId]
            );
            if (!found.rows[0]) throw new AppError(INVENTORY_ADJUSTMENT_ERRORS.ITEM_NOT_IN_DOCUMENT);
            await assertBinInProject(client, projectId, item.bin_id);
            if (await wouldBeNegative(client, type, item.itemId, item.bin_id, item.quantity_delta)) {
                throw new AppError(INVENTORY_ADJUSTMENT_ERRORS.EFFECTIVE_BELOW_ZERO);
            }
            lines.push({ itemId: item.itemId, productId: found.rows[0].product_id, binId: item.bin_id, delta: item.quantity_delta });
        }

        const adjustmentId = await applyAdjustment(client, user.user_id, projectId, type, documentId, "correccion", body.reason, body.adjustment_date, lines);
        const detail = await loadDetail(client, projectId, adjustmentId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const correctGoodsReceiptService = (user: DecodedToken, { projectId }: ProjectIdParam, goodsReceiptId: number, body: CorrectGoodsReceiptBody) =>
    correct(user, projectId, "goods_receipt", goodsReceiptId, {
        reason: body.reason, adjustment_date: body.adjustment_date,
        items: body.items.map((i) => ({ itemId: i.goods_receipt_item_id, bin_id: i.bin_id, quantity_delta: i.quantity_delta })),
    });

export const correctGoodsIssueService = (user: DecodedToken, { projectId }: ProjectIdParam, goodsIssueId: number, body: CorrectGoodsIssueBody) =>
    correct(user, projectId, "goods_issue", goodsIssueId, {
        reason: body.reason, adjustment_date: body.adjustment_date,
        items: body.items.map((i) => ({ itemId: i.goods_issue_item_id, bin_id: i.bin_id, quantity_delta: i.quantity_delta })),
    });

// ---------------------------------------------------------------------------------------------
// Anulación completa
// ---------------------------------------------------------------------------------------------
// Revierte TODO lo efectivo del documento (lo registrado más los ajustes previos, por línea y
// casilla) y lo marca anulado. Si el material ya salió (ingreso) no hay stock que revertir:
// applyStockMovement rechaza con INSUFFICIENT_STOCK y no se anula nada. Un ingreso anulado ya
// no cuenta para la unicidad de su guía, así que se puede volver a registrar bien.
const voidDocument = async (
    user: DecodedToken, projectId: number, type: AdjustedDocumentType, documentId: number, body: VoidDocumentBody
): Promise<InventoryAdjustment> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "configure");
    const d = ADJUSTMENT_DOCS[type];

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await lockDocument(client, projectId, type, documentId);

        const effective = await client.query<{ item_id: number; product_id: number; bin_id: number; quantity: string }>(
            `SELECT t.item_id, it.product_id, t.bin_id, SUM(t.q)::numeric(18,6)::text AS quantity FROM (
                SELECT loc.${d.itemIdColumn} AS item_id, loc.bin_id, loc.quantity AS q
                FROM ${d.locationsTable} loc INNER JOIN ${d.itemsTable} i ON i.${d.itemIdColumn} = loc.${d.itemIdColumn}
                WHERE i.${d.headerIdColumn} = $1
                UNION ALL
                SELECT a.${d.itemIdColumn}, a.bin_id, a.quantity_delta
                FROM inventory_adjustment_items a INNER JOIN ${d.itemsTable} i ON i.${d.itemIdColumn} = a.${d.itemIdColumn}
                WHERE i.${d.headerIdColumn} = $1
            ) t INNER JOIN ${d.itemsTable} it ON it.${d.itemIdColumn} = t.item_id
            GROUP BY t.item_id, it.product_id, t.bin_id HAVING SUM(t.q) > 0 ORDER BY t.item_id, t.bin_id`,
            [documentId]
        );
        if (effective.rows.length === 0) throw new AppError(INVENTORY_ADJUSTMENT_ERRORS.NOTHING_TO_VOID);

        const lines: Line[] = effective.rows.map((r) => ({ itemId: r.item_id, productId: r.product_id, binId: r.bin_id, delta: -Number(r.quantity) }));
        const adjustmentId = await applyAdjustment(client, user.user_id, projectId, type, documentId, "anulacion", body.reason, body.adjustment_date, lines);

        await client.query(`UPDATE ${d.headerTable} SET voided_at = NOW(), voided_by = $2 WHERE ${d.headerIdColumn} = $1`, [documentId, user.user_id]);
        const detail = await loadDetail(client, projectId, adjustmentId);
        await client.query("COMMIT");
        return detail;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};

export const voidGoodsReceiptService = (user: DecodedToken, { projectId }: ProjectIdParam, goodsReceiptId: number, body: VoidDocumentBody) =>
    voidDocument(user, projectId, "goods_receipt", goodsReceiptId, body);

export const voidGoodsIssueService = (user: DecodedToken, { projectId }: ProjectIdParam, goodsIssueId: number, body: VoidDocumentBody) =>
    voidDocument(user, projectId, "goods_issue", goodsIssueId, body);

// ---------------------------------------------------------------------------------------------
// Consulta
// ---------------------------------------------------------------------------------------------
export const listAdjustmentsService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, query: ListAdjustmentsQuery
): Promise<InventoryAdjustment[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    const { rows } = await pool.query<HeaderRow>(
        `${ADJUSTMENT_HEADER_SELECT}
        WHERE ia.project_id = $1
            AND ($2::bigint IS NULL OR ia.goods_receipt_id = $2)
            AND ($3::bigint IS NULL OR ia.goods_issue_id = $3)
            AND ($4::text IS NULL OR ia.kind = $4)
        ORDER BY ia.inventory_adjustment_id DESC`,
        [projectId, query.goods_receipt_id ?? null, query.goods_issue_id ?? null, query.kind ?? null]
    );
    const items = await loadItems(pool, rows.map((r) => r.inventory_adjustment_id));
    return rows.map((r) => toAdjustment(r, items.get(String(r.inventory_adjustment_id)) ?? []));
};

export const getAdjustmentByIdService = async (
    user: DecodedToken, { projectId, adjustmentId }: AdjustmentIdParam
): Promise<InventoryAdjustment> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return loadDetail(pool, projectId, adjustmentId);
};
