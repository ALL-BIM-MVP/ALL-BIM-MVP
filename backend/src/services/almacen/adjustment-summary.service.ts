// Lectura de los ajustes por LÍNEA de un ingreso o de un vale (Fase 10): cuánto se ajustó,
// cuánto es lo efectivo (lo registrado más los ajustes) y dónde queda. Solo lectura y sin
// depender del servicio que escribe los ajustes: lo usan los detalles de ingresos y
// vales y las consultas de estado. Las cantidades son NUMERIC (string).
import type { Pool, PoolClient } from "pg";
import type { AdjustedDocumentType, AdjustmentKind, ItemAdjustmentSummary } from "../../models/almacen/inventory-adjustment.models.js";

type Db = Pick<Pool | PoolClient, "query">;

// Nombres de tabla/columna fijos del servidor (nunca del usuario).
export const ADJUSTMENT_DOCS = {
    goods_receipt: {
        itemsTable: "goods_receipt_items", itemIdColumn: "goods_receipt_item_id",
        locationsTable: "goods_receipt_item_locations", headerTable: "goods_receipts", headerIdColumn: "goods_receipt_id",
        // Sentido del cambio de cantidad sobre el stock: en un ingreso, más recibido = más stock.
        stockSign: 1,
    },
    goods_issue: {
        itemsTable: "goods_issue_items", itemIdColumn: "goods_issue_item_id",
        locationsTable: "goods_issue_item_locations", headerTable: "goods_issues", headerIdColumn: "goods_issue_id",
        // En un vale, más retirado = menos stock.
        stockSign: -1,
    },
} as const satisfies Record<AdjustedDocumentType, object>;

export const getItemAdjustmentSummaries = async (
    db: Db, documentType: AdjustedDocumentType, itemIds: (number | string)[]
): Promise<Map<string, ItemAdjustmentSummary>> => {
    const result = new Map<string, ItemAdjustmentSummary>();
    if (itemIds.length === 0) return result;
    const d = ADJUSTMENT_DOCS[documentType];
    const list = itemIds.map(String);

    const totals = await db.query<{ id: string; adjusted: string; effective: string }>(
        `SELECT it.${d.itemIdColumn} AS id,
            COALESCE(SUM(a.quantity_delta), 0)::numeric(18,6)::text AS adjusted,
            (it.total_quantity + COALESCE(SUM(a.quantity_delta), 0))::numeric(18,6)::text AS effective
        FROM ${d.itemsTable} it
        LEFT JOIN inventory_adjustment_items a ON a.${d.itemIdColumn} = it.${d.itemIdColumn}
        WHERE it.${d.itemIdColumn} = ANY($1::bigint[]) GROUP BY it.${d.itemIdColumn}, it.total_quantity`,
        [list]
    );
    const locations = await db.query<{ id: string; bin_id: number; label: string; quantity: string }>(
        `SELECT t.id, t.bin_id, w.name || ' · ' || r.name || ' · ' || b.location_label AS label,
            SUM(t.q)::numeric(18,6)::text AS quantity
        FROM (
            SELECT ${d.itemIdColumn} AS id, bin_id, quantity AS q FROM ${d.locationsTable} WHERE ${d.itemIdColumn} = ANY($1::bigint[])
            UNION ALL
            SELECT ${d.itemIdColumn} AS id, bin_id, quantity_delta AS q FROM inventory_adjustment_items WHERE ${d.itemIdColumn} = ANY($1::bigint[])
        ) t
        INNER JOIN bins b ON b.bin_id = t.bin_id
        INNER JOIN racks r ON r.rack_id = b.rack_id
        INNER JOIN warehouses w ON w.warehouse_id = r.warehouse_id
        GROUP BY t.id, t.bin_id, w.name, r.name, b.location_label HAVING SUM(t.q) <> 0
        ORDER BY t.id, t.bin_id`,
        [list]
    );
    const adjustments = await db.query<{
        id: string; inventory_adjustment_id: number; kind: AdjustmentKind; reason: string; adjustment_date: string; bin_id: number; quantity_delta: string;
    }>(
        `SELECT a.${d.itemIdColumn} AS id, ia.inventory_adjustment_id, ia.kind, ia.reason,
            to_char(ia.adjustment_date, 'YYYY-MM-DD') AS adjustment_date, a.bin_id, a.quantity_delta::numeric(18,6)::text AS quantity_delta
        FROM inventory_adjustment_items a
        INNER JOIN inventory_adjustments ia ON ia.inventory_adjustment_id = a.inventory_adjustment_id
        WHERE a.${d.itemIdColumn} = ANY($1::bigint[])
        ORDER BY ia.inventory_adjustment_id, a.inventory_adjustment_item_id`,
        [list]
    );

    for (const t of totals.rows) {
        result.set(String(t.id), {
            adjusted_quantity: t.adjusted,
            effective_quantity: t.effective,
            effective_locations: locations.rows.filter((l) => String(l.id) === String(t.id)).map((l) => ({ bin_id: l.bin_id, label: l.label, quantity: l.quantity })),
            adjustments: adjustments.rows.filter((a) => String(a.id) === String(t.id)).map(({ id: _id, ...a }) => a),
        });
    }
    return result;
};
