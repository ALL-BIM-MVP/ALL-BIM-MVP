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
import type { BinIdParam, UpdateBinBody } from "../../schemas/almacen/bin.schema.js";
import type { BinRow } from "../../models/almacen/bin.models.js";

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
// respuesta anidada de un rack con sus bins.
export const listBinsForRack = async (rackId: number): Promise<BinRow[]> => {
    const { rows } = await pool.query<BinRow>(
        `SELECT * FROM bins WHERE rack_id = $1 AND deleted_at IS NULL ORDER BY face, level, bay`,
        [rackId]
    );
    return rows;
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
