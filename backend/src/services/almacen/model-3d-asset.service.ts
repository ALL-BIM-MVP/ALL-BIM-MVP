// model_3d_assets — ver database/schema.sql. Del usuario que lo sube,
// NO de un proyecto — por eso NO llama a assertModulePermission acá
// para la subida (no hay ningún proyecto todavía en ese momento,
// cualquier usuario logueado puede subir a su propia biblioteca).
// Módulo hoja a propósito: NO importa nada de product.service.ts
// (evita el ciclo product→model-3d-asset→product) — product.service.ts
// sí importa de acá.
import fs from "node:fs/promises";
import path from "node:path";
import pool from "../../db/database.js";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { MODEL_3D_ASSET_ERRORS } from "../../models/errors/almacen/model-3d-asset.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { ROLES } from "../../constants/roles.js";
import { buildModel3DAssetUrl, type Model3DAssetRow } from "../../models/almacen/model-3d-asset.models.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";

const MODEL_3D_ALLOWED_EXTENSIONS = new Set(["glb", "gltf"]);

// La MISMA condición de visibilidad se repite en 3 lugares (listar,
// validar antes de asignar a un producto, servir el contenido) —
// centralizada acá para que las 3 nunca se desincronicen entre sí.
// Reglas (ver diseño, database/schema.sql):
//   1) `owner_id = yo` — mi propia biblioteca personal.
//   2) `is_system = true` — repositorio del sistema, siempre visible.
//   3) ya está en uso en algún producto de ESTE proyecto puntual
//      (aunque lo haya subido otra persona, sin ser admin) — así se
//      puede reusar dentro de un proyecto lo que ya subió un
//      compañero, sin que el catálogo se vuelva público para cualquier
//      proyecto de cualquiera.
const VISIBILITY_CLAUSE = `(
    ma.owner_id = $1
    OR ma.is_system = true
    OR EXISTS (
        SELECT 1 FROM products p WHERE p.project_id = $2 AND p.model_3d_asset_id = ma.model_3d_asset_id
    )
)`;

// Sube un archivo REAL nuevo a la biblioteca personal del usuario — no
// depende de ningún proyecto ni producto (eso es un paso aparte, ver
// product.service.ts, assignProductModel3DService). `is_system` se
// calcula UNA sola vez acá, con el rol que tiene el usuario EN ESTE
// MOMENTO — nunca se recalcula después (ver comentario grande en
// database/schema.sql).
export const uploadModel3DAssetService = async (
    user: DecodedToken, multerFile: Express.Multer.File
): Promise<Model3DAssetRow> => {
    const format = path.extname(multerFile.originalname).slice(1).toLowerCase();
    if (!MODEL_3D_ALLOWED_EXTENSIONS.has(format)) {
        await fs.unlink(multerFile.path).catch(() => {});
        throw new AppError(MODEL_3D_ASSET_ERRORS.MODEL_3D_ASSET_INVALID_EXTENSION);
    }

    const isSystem = user.role_id === ROLES.ADMINISTRADOR;
    const { rows } = await pool.query<Model3DAssetRow>(
        `INSERT INTO model_3d_assets (name, format, file_path, owner_id, is_system)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING model_3d_asset_id, name, format, owner_id, is_system, created_at`,
        [multerFile.originalname, format, multerFile.path, user.user_id, isSystem]
    );
    return rows[0]!;
};

// Usado por product.service.ts (assignProductModel3DService) para
// validar que un model_3d_asset_id recibido en el body sea de verdad
// visible para ESTE usuario, desde ESTE proyecto — antes de asignarlo.
export const assertModel3DAssetVisible = async (
    client: Pool | PoolClient, user: DecodedToken, projectId: number, assetId: number
): Promise<void> => {
    const { rowCount } = await client.query(
        `SELECT 1 FROM model_3d_assets ma WHERE ma.model_3d_asset_id = $3 AND ${VISIBILITY_CLAUSE}`,
        [user.user_id, projectId, assetId]
    );
    if (rowCount === 0) throw new AppError(MODEL_3D_ASSET_ERRORS.MODEL_3D_ASSET_NOT_FOUND);
};

// Catálogo visto "desde" un proyecto puntual — para un selector "elegí
// uno ya subido" en vez de subir un archivo nuevo cada vez. Mío + del
// sistema + lo que ya se usa en este proyecto (ver VISIBILITY_CLAUSE).
export const listModel3DAssetsService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<(Model3DAssetRow & { url: string })[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const { rows } = await pool.query<Model3DAssetRow>(
        `SELECT DISTINCT ma.model_3d_asset_id, ma.name, ma.format, ma.owner_id, ma.is_system, ma.created_at
        FROM model_3d_assets ma
        WHERE ${VISIBILITY_CLAUSE}
        ORDER BY ma.created_at DESC`,
        [user.user_id, projectId]
    );
    return rows.map((r) => ({ ...r, url: buildModel3DAssetUrl(projectId, r.model_3d_asset_id) }));
};

// Para el controller de GET .../model-3d-assets/:assetId/content — el
// mismo chequeo de visibilidad de arriba, EN CADA pedido (no hay URL
// firmada acá, ver comentario en model-3d-asset.models.ts) + la ruta
// real en disco para que el controller la sirva.
export const getModel3DAssetContentService = async (
    user: DecodedToken, projectId: number, assetId: number
): Promise<{ absolutePath: string; format: "glb" | "gltf" }> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const { rows } = await pool.query<Pick<Model3DAssetRow, "format"> & { file_path: string }>(
        `SELECT ma.format, ma.file_path FROM model_3d_assets ma WHERE ma.model_3d_asset_id = $3 AND ${VISIBILITY_CLAUSE}`,
        [user.user_id, projectId, assetId]
    );
    const asset = rows[0];
    if (!asset) throw new AppError(MODEL_3D_ASSET_ERRORS.MODEL_3D_ASSET_NOT_FOUND);

    const existsOnDisk = await fs.access(asset.file_path).then(() => true).catch(() => false);
    if (!existsOnDisk) throw new AppError(MODEL_3D_ASSET_ERRORS.MODEL_3D_ASSET_NOT_FOUND);

    return { absolutePath: asset.file_path, format: asset.format };
};
