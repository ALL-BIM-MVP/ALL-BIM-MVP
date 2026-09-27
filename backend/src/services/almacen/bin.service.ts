// bins — ver docs/roadmap/almacen-bim-base-datos.md 1.4. Sin CRUD
// propio en esta fase (se generan solas con su rack, ver
// insertBinsForRack más abajo, llamado desde rack.service.ts dentro de
// la misma transacción) — solo el rename explícito que pide el diseño
// ("nombre... editable, puede repetirse").
//
// Módulo hoja a propósito: NO importa nada de rack.service.ts (evita
// el ciclo rack→bin→rack, ya que rack.service.ts sí importa de acá) —
// el chequeo de que el rack exista se hace acá mismo con una consulta
// liviana, no reusando getRackRowOrThrow.
import pool from "../../db/database.js";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { BIN_ERRORS } from "../../models/errors/almacen/bin.errors.js";
// Importar el error de rack acá NO genera el ciclo que sí generaría
// importar services/almacen/rack.service.ts (ver comentario grande más
// arriba) — es solo la constante de error, no una llamada de servicio
// a servicio.
import { RACK_ERRORS } from "../../models/errors/almacen/rack.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE, getWarehouseRowOrThrow } from "./warehouse.service.js";
import { buildModel3DAssetUrl } from "../../models/almacen/model-3d-asset.models.js";
import { buildSet } from "../../utils/partial-update.js";
import type { BinContentIdParam, BinIdParam, UpdateBinBody, UpdateBinContentPoseBody } from "../../schemas/almacen/bin.schema.js";
import type { BinContentSummary, BinRow, BinWithContents } from "../../models/almacen/bin.models.js";

// Bahía/nivel se muestran 1-based en `location_label` (más legible que
// empezar en 0), aunque se guarden 0-based en las columnas — mismo
// criterio de rótulo que ya usa el prototipo (nombreEstante + ' ·
// bahía ' + (bx+1) + ' · nivel ' + ...). `name` arranca igual a
// `location_label` pero es editable después (ver diseño 1.4) — acá
// recién creada, todavía no se editó.
export const buildBins = (
    rackName: string, width: number, levels: number, depth: number
): { bay: number; level: number; face: number; location_label: string; name: string }[] => {
    const rows: { bay: number; level: number; face: number; location_label: string; name: string }[] = [];
    const faces = depth === 2 ? [0, 1] : [0];

    for (let bay = 0; bay < width; bay++) {
        for (let level = 0; level < levels; level++) {
            for (const face of faces) {
                const faceLabel = depth === 2 ? ` · cara ${face === 0 ? "delantera" : "trasera"}` : "";
                const locationLabel = `${rackName} · bahía ${bay + 1} · nivel ${level + 1}${faceLabel}`;
                rows.push({ bay, level, face, location_label: locationLabel, name: locationLabel });
            }
        }
    }
    return rows;
};

// Llamado desde rack.service.ts (createRackService), dentro de la
// MISMA transacción que el INSERT del rack — por eso recibe el
// `client` de esa transacción en vez de usar el `pool` global.
export const insertBinsForRack = async (
    client: PoolClient, rackId: number, rackName: string, width: number, levels: number, depth: number
): Promise<void> => {
    const rows = buildBins(rackName, width, levels, depth);
    for (const r of rows) {
        await client.query(
            `INSERT INTO bins (rack_id, bay, level, face, location_label, name)
            VALUES ($1,$2,$3,$4,$5,$6)`,
            [rackId, r.bay, r.level, r.face, r.location_label, r.name]
        );
    }
};

// Llamado desde rack.service.ts (getRackByIdService) para armar la
// respuesta anidada de un rack con sus bins — incluye qué hay guardado
// en cada uno (`contents`, [] si está vacío). No existía ningún camino
// para ver esto (bin_contents solo se tocaba desde goods-receipt/
// goods-issue) hasta que se pidió explícito poder verlo acá. Un solo
// query con `json_agg`/`FILTER` en vez de N+1 — trae también el modelo
// 3D del producto (si tiene) para no necesitar una consulta aparte por
// cada bin ocupado. Recibe `projectId` (no se puede sacar de `rackId`
// sin otro JOIN) porque la URL del modelo 3D siempre es relativa a
// "desde qué proyecto se está mirando esto" (ver
// model-3d-asset.service.ts, VISIBILITY_CLAUSE) — OJO, esto NO valida
// que el modelo sea visible desde este proyecto (rack/bin ya están
// bien acotados a su propio proyecto por getRackByIdService antes de
// llegar acá), solo arma la URL con la forma correcta.
export const listBinsForRack = async (rackId: number, projectId: number): Promise<BinWithContents[]> => {
    // model_3d_asset_id viaja crudo en el JSON del query (Postgres no
    // puede llamar a buildModel3DAssetUrl, es JS) — se resuelve a
    // model_3d_url recién abajo, después de leer, mismo criterio que
    // transformProductModel3D en product.models.ts (nunca se guarda,
    // siempre se recalcula al leer).
    const { rows } = await pool.query<Omit<BinWithContents, "contents"> & { contents: (Omit<BinContentSummary, "model_3d_url"> & { model_3d_asset_id: number | null })[] }>(
        `SELECT b.*,
            COALESCE(
                json_agg(
                    json_build_object(
                        'bin_content_id', bc.bin_content_id::text,
                        'product_id', p.product_id::text, 'category_id', p.category_id, 'code', p.code, 'display_id', p.display_id,
                        'name', p.name, 'unit', p.unit,
                        'quantity', bc.quantity::numeric(18,6)::text,
                        'model_3d_asset_id', p.model_3d_asset_id, 'model_3d_format', ma.format,
                        'position_x', bc.position_x::numeric(18,6)::text, 'position_y', bc.position_y::numeric(18,6)::text, 'position_z', bc.position_z::numeric(18,6)::text,
                        'rotation_x', bc.rotation_x::numeric(18,6)::text, 'rotation_y', bc.rotation_y::numeric(18,6)::text, 'rotation_z', bc.rotation_z::numeric(18,6)::text,
                        'scale', bc.scale::numeric(18,6)::text
                    )
                ) FILTER (WHERE bc.bin_content_id IS NOT NULL),
                '[]'
            ) AS contents
        FROM bins b
        LEFT JOIN bin_contents bc ON bc.bin_id = b.bin_id AND bc.quantity > 0
        LEFT JOIN products p ON p.product_id = bc.product_id
        LEFT JOIN model_3d_assets ma ON ma.model_3d_asset_id = p.model_3d_asset_id
        WHERE b.rack_id = $1 AND b.deleted_at IS NULL
        GROUP BY b.bin_id
        ORDER BY b.face, b.level, b.bay`,
        [rackId]
    );
    return rows.map((row) => ({
        ...row,
        contents: row.contents.map(({ model_3d_asset_id, ...content }) => ({
            ...content,
            model_3d_url: model_3d_asset_id !== null ? buildModel3DAssetUrl(projectId, model_3d_asset_id) : null,
        })),
    }));
};

export const updateBinService = async (
    user: DecodedToken, { projectId, warehouseId, rackId, binId }: BinIdParam, body: UpdateBinBody
): Promise<BinRow> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");
    await getWarehouseRowOrThrow(projectId, warehouseId);

    // Chequeo liviano de que el rack exista y sea de este warehouse —
    // a propósito no reusa getRackRowOrThrow (evita importar
    // rack.service.ts, ver comentario grande arriba).
    const { rowCount: rackExists } = await pool.query(
        `SELECT 1 FROM racks WHERE rack_id = $1 AND warehouse_id = $2 AND deleted_at IS NULL`,
        [rackId, warehouseId]
    );
    if (rackExists === 0) throw new AppError(RACK_ERRORS.RACK_NOT_FOUND);

    const { rows } = await pool.query<BinRow>(
        `UPDATE bins SET name = $1, updated_at = NOW()
        WHERE bin_id = $2 AND rack_id = $3 AND deleted_at IS NULL
        RETURNING *`,
        [body.name, binId, rackId]
    );
    const bin = rows[0];
    if (!bin) throw new AppError(BIN_ERRORS.BIN_NOT_FOUND);
    return bin;
};

const POSE_COLUMNS = ["position_x", "position_y", "position_z", "rotation_x", "rotation_y", "rotation_z", "scale"] as const;

// Ajusta CÓMO SE VE un contenido dentro de su casilla (posición/rotación/escala) — nunca
// cuánto hay: eso solo lo cambian ingreso/vale/ajuste (inventory-movement.service.ts).
// Por eso va con el permiso "process" de siempre, no "configure": no es un dato de
// inventario, no genera Kardex ni pasa por inventory_adjustments.
export const updateBinContentPoseService = async (
    user: DecodedToken, { projectId, warehouseId, rackId, binId, binContentId }: BinContentIdParam, body: UpdateBinContentPoseBody
): Promise<Pick<BinContentSummary, "bin_content_id" | "position_x" | "position_y" | "position_z" | "rotation_x" | "rotation_y" | "rotation_z" | "scale">> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");
    await getWarehouseRowOrThrow(projectId, warehouseId);

    const { rowCount: rackExists } = await pool.query(
        `SELECT 1 FROM racks WHERE rack_id = $1 AND warehouse_id = $2 AND deleted_at IS NULL`,
        [rackId, warehouseId]
    );
    if (rackExists === 0) throw new AppError(RACK_ERRORS.RACK_NOT_FOUND);

    const { rowCount: binExists } = await pool.query(`SELECT 1 FROM bins WHERE bin_id = $1 AND rack_id = $2 AND deleted_at IS NULL`, [binId, rackId]);
    if (binExists === 0) throw new AppError(BIN_ERRORS.BIN_NOT_FOUND);

    const { set, values } = buildSet(POSE_COLUMNS, body, 3);
    const { rows } = await pool.query<Pick<BinContentSummary, "bin_content_id" | "position_x" | "position_y" | "position_z" | "rotation_x" | "rotation_y" | "rotation_z" | "scale">>(
        `UPDATE bin_contents SET ${set}, updated_at = NOW()
        WHERE bin_content_id = $1 AND bin_id = $2
        RETURNING bin_content_id::text,
            position_x::numeric(18,6)::text, position_y::numeric(18,6)::text, position_z::numeric(18,6)::text,
            rotation_x::numeric(18,6)::text, rotation_y::numeric(18,6)::text, rotation_z::numeric(18,6)::text,
            scale::numeric(18,6)::text`,
        [binContentId, binId, ...values]
    );
    const content = rows[0];
    if (!content) throw new AppError(BIN_ERRORS.CONTENT_NOT_FOUND);
    return content;
};

// Usado por goods-receipt.service.ts/goods-issue.service.ts para
// validar que un bin_id recibido en el body pertenezca de verdad a
// este proyecto (bin → rack → warehouse → project) y siga activo,
// antes de tocar cualquier movimiento.
export const assertBinInProject = async (
    client: Pool | PoolClient, projectId: number, binId: number
): Promise<void> => {
    const { rowCount } = await client.query(
        `SELECT 1 FROM bins b
        INNER JOIN racks r ON r.rack_id = b.rack_id
        INNER JOIN warehouses w ON w.warehouse_id = r.warehouse_id
        WHERE b.bin_id = $1 AND w.project_id = $2
            AND b.deleted_at IS NULL AND r.deleted_at IS NULL AND w.deleted_at IS NULL`,
        [binId, projectId]
    );
    if (rowCount === 0) throw new AppError(BIN_ERRORS.BIN_NOT_FOUND);
};
