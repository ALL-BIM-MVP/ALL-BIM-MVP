// Hoja de vida de una UBICACIÓN (estante o casilla): qué hay ahora y todos los movimientos físicos
// (ingresos, vales y ajustes) de cualquier producto que pasó por ella. Solo lectura. Mismos filtros y
// orden que la hoja de vida del producto (fechas, tipo, sort, direction) más `product_id`.
import pool from "../../db/database.js";
import { AppError } from "../../models/errors/app-error.js";
import { BIN_ERRORS } from "../../models/errors/almacen/bin.errors.js";
import { RACK_ERRORS } from "../../models/errors/almacen/rack.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE, getWarehouseRowOrThrow } from "./warehouse.service.js";
import { HISTORY_MAX_EVENTS, sortHistoryItems } from "./product-history.service.js";
import { productSummarySql } from "../../utils/product-summary.js";
import type { BinIdParam } from "../../schemas/almacen/bin.schema.js";
import type { RackIdParam } from "../../schemas/almacen/rack.schema.js";
import type { LocationHistoryQuery } from "../../schemas/almacen/location-history.schema.js";
import type { LocationHistory, LocationMovement } from "../../models/almacen/location-history.models.js";

type Row = Record<string, unknown>;

const buildHistory = async (
    projectId: number, warehouseId: number, rackId: number, binId: number | null, query: Partial<LocationHistoryQuery>
): Promise<LocationHistory> => {
    const warehouse = await getWarehouseRowOrThrow(projectId, warehouseId);
    const rackResult = await pool.query<{ rack_id: number; name: string }>(
        `SELECT rack_id, name FROM racks WHERE rack_id = $1 AND warehouse_id = $2 AND deleted_at IS NULL`, [rackId, warehouseId]);
    const rack = rackResult.rows[0];
    if (!rack) throw new AppError(RACK_ERRORS.RACK_NOT_FOUND);
    let bin: { bin_id: number; label: string; name: string } | null = null;
    if (binId !== null) {
        const binResult = await pool.query<{ bin_id: number; label: string; name: string }>(
            `SELECT bin_id, location_label AS label, name FROM bins WHERE bin_id = $1 AND rack_id = $2 AND deleted_at IS NULL`, [binId, rackId]);
        bin = binResult.rows[0] ?? null;
        if (!bin) throw new AppError(BIN_ERRORS.BIN_NOT_FOUND);
    }

    const productId = query.product_id ?? null;
    const from = query.from ?? null;
    const to = query.to ?? null;
    const type = query.type ?? "all";
    const sort = query.sort ?? "date";
    const direction = query.direction ?? "desc";

    // Casillas de la ubicación: la pedida o todas las del estante.
    const scope = `b.rack_id = $1 AND ($2::bigint IS NULL OR b.bin_id = $2) AND b.deleted_at IS NULL`;

    const contents = await pool.query<{ product: LocationHistory["contents"][number]["product"]; quantity: string }>(
        `SELECT ${productSummarySql("p")} AS product, SUM(bc.quantity)::numeric(18,6)::text AS quantity
        FROM bin_contents bc INNER JOIN bins b ON b.bin_id = bc.bin_id INNER JOIN products p ON p.product_id = bc.product_id
        WHERE ${scope} AND bc.quantity > 0 AND ($3::bigint IS NULL OR bc.product_id = $3)
        GROUP BY p.product_id ORDER BY p.display_id, p.product_id`,
        [rackId, binId, productId]
    );

    const movements = await pool.query<Row>(
        `SELECT im.type, to_char(im.movement_date, 'YYYY-MM-DD') AS date, ${productSummarySql("p")} AS product,
            im.bin_id, b.location_label AS bin_label, im.quantity::numeric(18,6)::text AS quantity, im.resulting_balance::numeric(18,6)::text AS balance,
            im.reference_document_type, im.reference_document_id,
            gr.delivery_note_series, gr.delivery_note_number, gr.entry_type, s.supplier_id, s.ruc AS supplier_ruc, s.name AS supplier_name,
            gi.number AS issue_number, gi.destination_sector, gi.destination_level, gi.destination_block, gi.recipient_name,
            ia.reason AS adjustment_reason, ia.goods_receipt_id AS adjusted_receipt_id, ia.goods_issue_id AS adjusted_issue_id,
            CASE WHEN ia.goods_receipt_id IS NOT NULL
                THEN (SELECT concat(x.delivery_note_series, '-', x.delivery_note_number) FROM goods_receipts x WHERE x.goods_receipt_id = ia.goods_receipt_id)
                ELSE (SELECT y.number FROM goods_issues y WHERE y.goods_issue_id = ia.goods_issue_id) END AS adjusted_label
        FROM inventory_movements im
        INNER JOIN bins b ON b.bin_id = im.bin_id
        INNER JOIN products p ON p.product_id = im.product_id
        LEFT JOIN goods_receipts gr ON im.reference_document_type = 'goods_receipt' AND gr.goods_receipt_id = im.reference_document_id
        LEFT JOIN suppliers s ON s.supplier_id = gr.supplier_id
        LEFT JOIN goods_issues gi ON im.reference_document_type = 'goods_issue' AND gi.goods_issue_id = im.reference_document_id
        LEFT JOIN inventory_adjustments ia ON im.reference_document_type = 'inventory_adjustment' AND ia.inventory_adjustment_id = im.reference_document_id
        WHERE ${scope} AND ($3::bigint IS NULL OR im.product_id = $3)
            AND ($4::date IS NULL OR im.movement_date >= $4::date) AND ($5::date IS NULL OR im.movement_date <= $5::date)
            AND ($6::text = 'all' OR im.type = $6::text)
        ORDER BY im.movement_date DESC, im.inventory_movement_id DESC LIMIT ${HISTORY_MAX_EVENTS + 1}`,
        [rackId, binId, productId, from, to, type]
    );
    const truncated = movements.rows.length > HISTORY_MAX_EVENTS;

    const items: LocationMovement[] = movements.rows.slice(0, HISTORY_MAX_EVENTS).map((m) => {
        const referenceType = m.reference_document_type as "goods_receipt" | "goods_issue" | "inventory_adjustment";
        const isReceipt = referenceType === "goods_receipt";
        const isIssue = referenceType === "goods_issue";
        const isAdjustment = referenceType === "inventory_adjustment";
        const adjustedIsReceipt = m.adjusted_receipt_id != null;
        return {
            type: m.type as "entrada" | "salida", date: String(m.date), product: m.product as LocationMovement["product"],
            bin: { bin_id: m.bin_id as number, label: String(m.bin_label) }, quantity: String(m.quantity), balance_after: String(m.balance),
            document: {
                type: referenceType, id: m.reference_document_id as number,
                label: isReceipt ? `${m.delivery_note_series}-${m.delivery_note_number}` : isIssue ? String(m.issue_number) : `Ajuste #${m.reference_document_id}`,
            },
            reason: isAdjustment ? String(m.adjustment_reason) : null,
            adjusted_document: isAdjustment
                ? { type: adjustedIsReceipt ? "goods_receipt" : "goods_issue", id: (adjustedIsReceipt ? m.adjusted_receipt_id : m.adjusted_issue_id) as number, label: String(m.adjusted_label) }
                : null,
            supplier: isReceipt && m.supplier_id != null ? { supplier_id: m.supplier_id as number, ruc: String(m.supplier_ruc), name: String(m.supplier_name) } : null,
            entry_type: isReceipt ? (m.entry_type as "normal" | "rapida") : null,
            destination: isIssue ? [m.destination_sector, m.destination_level, m.destination_block].join(" · ") : null,
            recipient_name: isIssue ? String(m.recipient_name) : null,
        };
    });

    return {
        location: {
            level: bin ? "bin" : "rack", warehouse: { warehouse_id: warehouse.warehouse_id, name: warehouse.name },
            rack: { rack_id: rack.rack_id, name: rack.name }, bin,
        },
        filters: { product_id: productId === null ? null : String(productId), from, to, type, sort, direction },
        contents: contents.rows,
        items: sortHistoryItems(items, sort, direction),
        truncated,
    };
};

export const getRackHistoryService = async (
    user: DecodedToken, { projectId, warehouseId, rackId }: RackIdParam, query: Partial<LocationHistoryQuery>
): Promise<LocationHistory> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return buildHistory(projectId, warehouseId, rackId, null, query);
};

export const getBinHistoryService = async (
    user: DecodedToken, { projectId, warehouseId, rackId, binId }: BinIdParam, query: Partial<LocationHistoryQuery>
): Promise<LocationHistory> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return buildHistory(projectId, warehouseId, rackId, binId, query);
};
