// inventory_movements (Kardex) — ver
// docs/roadmap/almacen-bim-base-datos.md 4.6. `applyStockMovement` es
// el núcleo compartido de Ingreso y Salida (suma o resta según
// `direction`, ambos llaman a esto por cada reparto ubicación+cantidad
// dentro de su propia transacción) — evita duplicar la lógica de
// "sumar/crear en bin_contents + snapshot del saldo + insertar el
// movimiento" en los 2 archivos.
import pool from "../../db/database.js";
import type { PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { INVENTORY_MOVEMENT_ERRORS } from "../../models/errors/almacen/inventory-movement.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type { ListInventoryMovementsQuery } from "../../schemas/almacen/inventory-movement.schema.js";
import type { InventoryMovementRow } from "../../models/almacen/inventory-movement.models.js";

interface ApplyStockMovementParams {
    productId: number;
    binId: number;
    // Siempre positiva — el signo real lo decide `direction`.
    quantity: number;
    direction: "entrada" | "salida";
    referenceDocumentType: "goods_receipt" | "goods_issue";
    referenceDocumentId: number;
    // Fecha del documento (received_date / issue_date) como "AAAA-MM-DD".
    movementDate: string;
    userId: number;
}

// UPDATE guardado atómico (mismo criterio que los borrados de
// almacen/estante en Fase 2): el chequeo de "no te quedes en negativo"
// va DENTRO del WHERE del UPDATE, no en una lectura previa separada —
// sin eso, dos Salidas simultáneas sobre el mismo bin podrían leer el
// mismo saldo antes de que ninguna de las dos actualice, y las dos
// pasarían la validación aunque juntas sí lo dejen negativo. El CHECK
// (bin_contents.quantity >= 0) es el respaldo real de motor por si
// esto se llama alguna vez sin pasar por acá.
export const applyStockMovement = async (
    client: PoolClient, params: ApplyStockMovementParams
): Promise<void> => {
    const delta = params.direction === "entrada" ? params.quantity : -params.quantity;

    const updateResult = await client.query<{ bin_content_id: number }>(
        `UPDATE bin_contents SET quantity = quantity + $1, updated_at = NOW()
        WHERE bin_id = $2 AND product_id = $3 AND quantity + $1 >= 0
        RETURNING bin_content_id`,
        [delta, params.binId, params.productId]
    );

    if (updateResult.rowCount === 0) {
        // Salida sin fila previa, o fila previa que no alcanza — en
        // los dos casos no hay stock suficiente en ESTE bin puntual
        // para sacar esta cantidad (distinto bin con superávit no
        // cuenta, se saca de donde se dice que se saca).
        if (params.direction === "salida") throw new AppError(INVENTORY_MOVEMENT_ERRORS.INSUFFICIENT_STOCK);

        // Entrada a un bin que todavía no tenía contenido de este
        // producto — se crea la fila (delta ya es positivo acá).
        await client.query(
            `INSERT INTO bin_contents (bin_id, product_id, quantity, created_by) VALUES ($1,$2,$3,$4)`,
            [params.binId, params.productId, delta, params.userId]
        );
    }

    // Saldo total del producto (todas sus ubicaciones), snapshoteado
    // JUSTO DESPUÉS de este movimiento puntual — nunca se recalcula al
    // leer (diseño 4.6).
    const balanceResult = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(quantity), 0) AS total FROM bin_contents WHERE product_id = $1`,
        [params.productId]
    );
    const resultingBalance = Number(balanceResult.rows[0]!.total);

    await client.query(
        `INSERT INTO inventory_movements
            (product_id, type, quantity, bin_id, resulting_balance, reference_document_type, reference_document_id,
             movement_date, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9)`,
        [
            params.productId, params.direction, params.quantity, params.binId, resultingBalance,
            params.referenceDocumentType, params.referenceDocumentId, params.movementDate, params.userId,
        ]
    );
};

export const listInventoryMovementsService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, query: ListInventoryMovementsQuery
): Promise<InventoryMovementRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const { rows } = await pool.query<InventoryMovementRow>(
        `SELECT im.inventory_movement_id, im.product_id, im.type, im.quantity, im.bin_id, im.resulting_balance,
            im.reference_document_type, im.reference_document_id,
            to_char(im.movement_date, 'YYYY-MM-DD') AS movement_date, im.created_at, im.created_by
        FROM inventory_movements im
        INNER JOIN products p ON p.product_id = im.product_id
        WHERE p.project_id = $1
            AND ($2::bigint IS NULL OR im.product_id = $2)
            AND ($3::date IS NULL OR im.movement_date >= $3::date)
            AND ($4::date IS NULL OR im.movement_date <= $4::date)
        ORDER BY im.movement_date DESC, im.inventory_movement_id DESC`,
        [projectId, query.product_id ?? null, query.from ?? null, query.to ?? null]
    );
    return rows;
};
