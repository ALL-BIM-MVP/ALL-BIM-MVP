// goods_issues (Vale de Salida) — ver
// docs/roadmap/almacen-bim-base-datos.md 4.4-4.5. Simétrico a
// goods-receipt.service.ts (resta en vez de sumar) — mismos imports,
// mismo motivo de por qué no hay ciclo.
import pool from "../../db/database.js";
import { AppError } from "../../models/errors/app-error.js";
import { GOODS_ISSUE_ERRORS } from "../../models/errors/almacen/goods-issue.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { assertProductInProject } from "./product.service.js";
import { assertBinInProject } from "./bin.service.js";
import { applyStockMovement } from "./inventory-movement.service.js";
import { getItemAdjustmentSummaries } from "./adjustment-summary.service.js";
import type { CreateGoodsIssueBody, GoodsIssueIdParam } from "../../schemas/almacen/goods-issue.schema.js";
import type {
    GoodsIssueDetail, GoodsIssueItemLocationRow, GoodsIssueItemRow, GoodsIssueRow,
} from "../../models/almacen/goods-issue.models.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import { productSummarySql } from "../../utils/product-summary.js";

// issue_date sale como texto AAAA-MM-DD (columna DATE): sin pasar por un
// Date, no depende de la zona horaria del servidor. Fragmento fijo.
const GOODS_ISSUE_SELECT = `
    SELECT goods_issue_id, project_id, number, destination_sector, destination_level, destination_block,
        recipient_name, recipient_dni, to_char(issue_date, 'YYYY-MM-DD') AS issue_date, created_at, created_by,
        voided_at IS NOT NULL AS voided, voided_at
    FROM goods_issues`;

export const listGoodsIssuesService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<GoodsIssueRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const { rows } = await pool.query<GoodsIssueRow>(
        `${GOODS_ISSUE_SELECT} WHERE project_id = $1 ORDER BY created_at DESC`,
        [projectId]
    );
    return rows;
};

export const getGoodsIssueByIdService = async (
    user: DecodedToken, { projectId, goodsIssueId }: GoodsIssueIdParam
): Promise<GoodsIssueDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const headerResult = await pool.query<GoodsIssueRow>(
        `${GOODS_ISSUE_SELECT} WHERE goods_issue_id = $1 AND project_id = $2`,
        [goodsIssueId, projectId]
    );
    const header = headerResult.rows[0];
    if (!header) throw new AppError(GOODS_ISSUE_ERRORS.NOT_FOUND);

    const itemsResult = await pool.query<GoodsIssueItemRow>(
        `SELECT gii.*, ${productSummarySql('p')} AS product
        FROM goods_issue_items gii INNER JOIN products p ON p.product_id = gii.product_id
        WHERE gii.goods_issue_id = $1 ORDER BY gii.goods_issue_item_id`,
        [goodsIssueId]
    );
    const locationsResult = await pool.query<GoodsIssueItemLocationRow>(
        `SELECT gil.* FROM goods_issue_item_locations gil
        INNER JOIN goods_issue_items gii ON gii.goods_issue_item_id = gil.goods_issue_item_id
        WHERE gii.goods_issue_id = $1
        ORDER BY gil.goods_issue_item_location_id`,
        [goodsIssueId]
    );

    // Ajustes (Fase 10): lo registrado no cambia; se agrega lo efectivo y dónde queda.
    const adjustments = await getItemAdjustmentSummaries(pool, "goods_issue", itemsResult.rows.map((i) => i.goods_issue_item_id));

    const items = itemsResult.rows.map((item) => ({
        ...item,
        ...adjustments.get(String(item.goods_issue_item_id))!,
        locations: locationsResult.rows.filter((loc) => loc.goods_issue_item_id === item.goods_issue_item_id),
    }));

    return { ...header, items };
};

// Sin PUT/DELETE (registro de movimiento inmutable). Mismo criterio
// que createGoodsReceiptService: se valida todo, se crea header+ítems+
// repartos en una transacción, y por cada reparto applyStockMovement
// resta de bin_contents — si algún bin no tiene stock suficiente,
// applyStockMovement tira INSUFFICIENT_STOCK y el ROLLBACK deshace todo
// el vale completo (no queda una salida "a medias").
export const createGoodsIssueService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreateGoodsIssueBody
): Promise<GoodsIssueDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        for (const item of body.items) {
            await assertProductInProject(client, projectId, item.product_id);
            for (const location of item.locations) {
                await assertBinInProject(client, projectId, location.bin_id);
            }
        }

        const headerResult = await client.query<{ goods_issue_id: number }>(
            `INSERT INTO goods_issues
                (project_id, number, destination_sector, destination_level, destination_block, recipient_name, recipient_dni, issue_date, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING goods_issue_id`,
            [
                projectId, body.number, body.destination_sector, body.destination_level, body.destination_block,
                body.recipient_name, body.recipient_dni, body.issue_date, user.user_id,
            ]
        );
        const goodsIssueId = headerResult.rows[0]!.goods_issue_id;

        for (const item of body.items) {
            const itemResult = await client.query<{ goods_issue_item_id: number }>(
                `INSERT INTO goods_issue_items (goods_issue_id, product_id, total_quantity)
                VALUES ($1,$2,$3)
                RETURNING goods_issue_item_id`,
                [goodsIssueId, item.product_id, item.total_quantity]
            );
            const goodsIssueItemId = itemResult.rows[0]!.goods_issue_item_id;

            for (const location of item.locations) {
                await client.query(
                    `INSERT INTO goods_issue_item_locations (goods_issue_item_id, bin_id, quantity)
                    VALUES ($1,$2,$3)`,
                    [goodsIssueItemId, location.bin_id, location.quantity]
                );

                await applyStockMovement(client, {
                    productId: item.product_id,
                    binId: location.bin_id,
                    quantity: location.quantity,
                    direction: "salida",
                    referenceDocumentType: "goods_issue",
                    referenceDocumentId: goodsIssueId,
                    movementDate: body.issue_date,
                    userId: user.user_id,
                });
            }
        }

        await client.query("COMMIT");
        return await getGoodsIssueByIdService(user, { projectId, goodsIssueId });
    } catch (error) {
        await client.query("ROLLBACK");
        if ((error as { code?: string }).code === "23505") throw new AppError(GOODS_ISSUE_ERRORS.DUPLICATE_NUMBER);
        throw error;
    } finally {
        client.release();
    }
};
