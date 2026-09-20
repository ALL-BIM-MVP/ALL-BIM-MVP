// goods_receipts (Ingreso) — ver
// docs/roadmap/almacen-bim-base-datos.md 4.1-4.3. Importa de
// product.service.ts/bin.service.ts (validar identidad) y
// inventory-movement.service.ts (aplicar cada reparto) — ninguno de
// esos importa de acá, no hay ciclo.
import pool from "../../db/database.js";
import { AppError } from "../../models/errors/app-error.js";
import { GOODS_RECEIPT_ERRORS } from "../../models/errors/almacen/goods-receipt.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { assertProductInProject } from "./product.service.js";
import { assertBinInProject } from "./bin.service.js";
import { assertSupplierInProject } from "./supplier.service.js";
import { applyStockMovement } from "./inventory-movement.service.js";
import type { CreateGoodsReceiptBody, GoodsReceiptIdParam } from "../../schemas/almacen/goods-receipt.schema.js";
import type {
    GoodsReceiptDetail, GoodsReceiptItemLocationRow, GoodsReceiptItemRow, GoodsReceiptRow,
} from "../../models/almacen/goods-receipt.models.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";

// Columnas del ingreso + su proveedor embebido (json_build_object): RUC y
// nombre salen de `suppliers`, el ingreso solo guarda supplier_id. Fragmento
// fijo del servidor; usa el alias gr y hace el JOIN a suppliers como s.
const GOODS_RECEIPT_SELECT = `
    SELECT gr.goods_receipt_id, gr.project_id,
        json_build_object('supplier_id', s.supplier_id, 'ruc', s.ruc, 'name', s.name) AS supplier,
        gr.delivery_note_series, gr.delivery_note_number,
        to_char(gr.delivery_note_date, 'YYYY-MM-DD') AS delivery_note_date,
        to_char(gr.received_date, 'YYYY-MM-DD') AS received_date,
        gr.created_at, gr.created_by
    FROM goods_receipts gr
    INNER JOIN suppliers s ON s.supplier_id = gr.supplier_id`;

export const listGoodsReceiptsService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<GoodsReceiptRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const { rows } = await pool.query<GoodsReceiptRow>(
        `${GOODS_RECEIPT_SELECT} WHERE gr.project_id = $1 ORDER BY gr.created_at DESC`,
        [projectId]
    );
    return rows;
};

export const getGoodsReceiptByIdService = async (
    user: DecodedToken, { projectId, goodsReceiptId }: GoodsReceiptIdParam
): Promise<GoodsReceiptDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const headerResult = await pool.query<GoodsReceiptRow>(
        `${GOODS_RECEIPT_SELECT} WHERE gr.goods_receipt_id = $1 AND gr.project_id = $2`,
        [goodsReceiptId, projectId]
    );
    const header = headerResult.rows[0];
    if (!header) throw new AppError(GOODS_RECEIPT_ERRORS.NOT_FOUND);

    const itemsResult = await pool.query<GoodsReceiptItemRow>(
        `SELECT * FROM goods_receipt_items WHERE goods_receipt_id = $1 ORDER BY goods_receipt_item_id`,
        [goodsReceiptId]
    );
    const locationsResult = await pool.query<GoodsReceiptItemLocationRow>(
        `SELECT girl.* FROM goods_receipt_item_locations girl
        INNER JOIN goods_receipt_items gri ON gri.goods_receipt_item_id = girl.goods_receipt_item_id
        WHERE gri.goods_receipt_id = $1
        ORDER BY girl.goods_receipt_item_location_id`,
        [goodsReceiptId]
    );

    const items = itemsResult.rows.map((item) => ({
        ...item,
        locations: locationsResult.rows.filter((loc) => loc.goods_receipt_item_id === item.goods_receipt_item_id),
    }));

    return { ...header, items };
};

// Sin PUT/DELETE (registro de movimiento inmutable, ver diseño 5) —
// crea el ingreso COMPLETO (header + ítems + repartos) en una sola
// transacción y, por cada reparto, aplica el movimiento real
// (bin_contents + inventory_movements) — no hay un estado "borrador"
// intermedio en este diseño.
export const createGoodsReceiptService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreateGoodsReceiptBody
): Promise<GoodsReceiptDetail> => {
    // Corregido: era "upload" — quedaba solo, distinto de TODAS las
    // demás altas de este módulo (warehouse/rack/bin/product/goods
    // issue, todas piden "process"). No cambiaba nada hoy en la
    // práctica (el rol Editor sembrado en system-data.sql tiene los
    // dos permisos), pero sí sería inconsistente el día que se arme un
    // rol a medida con "process" pero sin "upload" — sin ninguna razón
    // real para que justo esta alta se comporte distinto.
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Validar que TODO lo referenciado exista en este proyecto
        // antes de insertar nada — mejor un 404/400 claro que una
        // transacción a medio armar.
        await assertSupplierInProject(client, projectId, body.supplier_id);

        for (const item of body.items) {
            await assertProductInProject(client, projectId, item.product_id);
            for (const location of item.locations) {
                await assertBinInProject(client, projectId, location.bin_id);
            }
        }

        const headerResult = await client.query<{ goods_receipt_id: number; received_date: string }>(
            `INSERT INTO goods_receipts
                (project_id, supplier_id, delivery_note_series, delivery_note_number, delivery_note_date, received_date, created_by)
            VALUES ($1,$2,$3,$4,$5, COALESCE($6::date, CURRENT_DATE), $7)
            RETURNING goods_receipt_id, to_char(received_date, 'YYYY-MM-DD') AS received_date`,
            [
                projectId, body.supplier_id, body.delivery_note_series, body.delivery_note_number,
                body.delivery_note_date, body.received_date ?? null, user.user_id,
            ]
        );
        const goodsReceiptId = headerResult.rows[0]!.goods_receipt_id;
        // El default (hoy) lo resuelve la base: el Kardex usa la fecha ya guardada.
        const receivedDate = headerResult.rows[0]!.received_date;

        for (const item of body.items) {
            const itemResult = await client.query<{ goods_receipt_item_id: number }>(
                `INSERT INTO goods_receipt_items (goods_receipt_id, product_id, total_quantity, quantity_per_delivery_note)
                VALUES ($1,$2,$3,$4)
                RETURNING goods_receipt_item_id`,
                [goodsReceiptId, item.product_id, item.total_quantity, item.quantity_per_delivery_note ?? null]
            );
            const goodsReceiptItemId = itemResult.rows[0]!.goods_receipt_item_id;

            for (const location of item.locations) {
                await client.query(
                    `INSERT INTO goods_receipt_item_locations (goods_receipt_item_id, bin_id, quantity)
                    VALUES ($1,$2,$3)`,
                    [goodsReceiptItemId, location.bin_id, location.quantity]
                );

                await applyStockMovement(client, {
                    productId: item.product_id,
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

        await client.query("COMMIT");
        return await getGoodsReceiptByIdService(user, { projectId, goodsReceiptId });
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
