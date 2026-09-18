// products (catálogo) — ver docs/roadmap/almacen-bim-base-datos.md 2.2.
// Importa de category.service.ts y model-3d-asset.service.ts (los dos
// más abajo en la jerarquía del módulo, mismo criterio que rack
// importa de warehouse) — ninguno de los dos importa de acá, no hay
// ciclo. Subir un modelo 3D nuevo NO pasa por acá (es una acción del
// usuario, sin proyecto — ver model-3d-asset.service.ts,
// uploadModel3DAssetService) — acá solo se ASIGNA uno ya existente.
import pool from "../../db/database.js";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { PRODUCT_ERRORS } from "../../models/errors/almacen/product.errors.js";
import { CATEGORY_ERRORS } from "../../models/errors/almacen/category.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { assertModel3DAssetVisible } from "./model-3d-asset.service.js";
import type { CategoryRow } from "../../models/almacen/category.models.js";
import type {
    ProductDetail, ProductListing, ProductRow, ProductRowWithAssetJoin, ProductWithModel3D,
} from "../../models/almacen/product.models.js";
import { transformProductModel3D } from "../../models/almacen/product.models.js";
import type {
    AssignProductModel3DBody, CreateProductBody, ListProductsQuery, ProductIdParam, UpdateProductBody,
} from "../../schemas/almacen/product.schema.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";

const UNIQUE_VIOLATION = "23505";

// Usado por goods-receipt.service.ts/goods-issue.service.ts para
// validar que un product_id recibido en el body pertenezca de verdad a
// este proyecto y siga activo, antes de tocar cualquier movimiento.
export const assertProductInProject = async (
    client: Pool | PoolClient, projectId: number, productId: number
): Promise<void> => {
    const { rowCount } = await client.query(
        `SELECT 1 FROM products WHERE product_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
        [productId, projectId]
    );
    if (rowCount === 0) throw new AppError(PRODUCT_ERRORS.PRODUCT_NOT_FOUND);
};

// Stock total (SUM sobre bin_contents), ubicación principal (el bin
// con más cantidad guardada de este producto, path completo
// warehouse·rack·bin) y el modelo 3D asignado (LEFT JOIN a
// model_3d_assets, ver product.models.ts/transformProductModel3D) —
// NUNCA columnas propias más allá de model_3d_asset_id, se calculan/
// resuelven siempre acá (ver diseño 2.2).
const PRODUCT_JOINS = `
    LEFT JOIN LATERAL (
        SELECT SUM(quantity) AS total FROM bin_contents WHERE product_id = p.product_id
    ) stock ON true
    LEFT JOIN LATERAL (
        SELECT w.name || ' · ' || r.name || ' · ' || b.location_label AS label
        FROM bin_contents bc
        INNER JOIN bins b ON b.bin_id = bc.bin_id
        INNER JOIN racks r ON r.rack_id = b.rack_id
        INNER JOIN warehouses w ON w.warehouse_id = r.warehouse_id
        WHERE bc.product_id = p.product_id
        ORDER BY bc.quantity DESC
        LIMIT 1
    ) loc ON true
    LEFT JOIN model_3d_assets ma ON ma.model_3d_asset_id = p.model_3d_asset_id
`;

export const listProductsService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, { category_id }: ListProductsQuery
): Promise<ProductListing[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const { rows } = await pool.query<ProductListing & ProductRowWithAssetJoin>(
        `SELECT p.*, ma.name AS model_3d_name, ma.format AS model_3d_format,
            COALESCE(stock.total, 0) AS total_stock, loc.label AS main_location
        FROM products p
        ${PRODUCT_JOINS}
        WHERE p.project_id = $1 AND p.deleted_at IS NULL
            AND ($2::int IS NULL OR p.category_id = $2)
        ORDER BY p.name`,
        [projectId, category_id ?? null]
    );
    return rows.map((r) => ({ ...transformProductModel3D(r, projectId), total_stock: r.total_stock, main_location: r.main_location }));
};

// Detalle con stock/ubicación + "productos relacionados" (Fase 3 del
// roadmap): solo tiene sentido cuando ESTE producto es de una
// categoría 'fijo' (una Partida) — sus Materiales/Equipos son los que
// la referencian por base_product_code. [] para un producto relacional.
export const getProductByIdService = async (
    user: DecodedToken, { projectId, productId }: ProductIdParam
): Promise<ProductDetail> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const { rows } = await pool.query<ProductListing & ProductRowWithAssetJoin & { category_type: "fijo" | "relacional" }>(
        `SELECT p.*, ma.name AS model_3d_name, ma.format AS model_3d_format,
            cat.type AS category_type,
            COALESCE(stock.total, 0) AS total_stock, loc.label AS main_location
        FROM products p
        INNER JOIN categories cat ON cat.category_id = p.category_id
        ${PRODUCT_JOINS}
        WHERE p.product_id = $1 AND p.project_id = $2 AND p.deleted_at IS NULL`,
        [productId, projectId]
    );
    const product = rows[0];
    if (!product) throw new AppError(PRODUCT_ERRORS.PRODUCT_NOT_FOUND);

    let related: ProductRow[] = [];
    if (product.category_type === "fijo") {
        const relatedResult = await pool.query<ProductRow>(
            `SELECT * FROM products WHERE project_id = $1 AND base_product_code = $2 AND deleted_at IS NULL ORDER BY name`,
            [projectId, product.code]
        );
        related = relatedResult.rows;
    }

    const { category_type, total_stock, main_location, ...rest } = product;
    return { ...transformProductModel3D(rest, projectId), total_stock, main_location, related };
};

// Un producto SIEMPRE nace sin modelo 3D — se asigna después, con sus
// propios endpoints (ver assignProductModel3DService más abajo, y
// uploadModel3DAssetService en model-3d-asset.service.ts para subir
// uno nuevo). No forma parte de este body a propósito (ver comentario
// grande en product.schema.ts).
export const createProductService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreateProductBody
): Promise<ProductRow> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // FOR UPDATE: bloquea la fila de la categoría por el resto de
        // la transacción — el riesgo real que señala el diseño 2.1
        // (dos altas simultáneas pisándose el mismo `next_display_id`)
        // se blinda acá, no alcanza con leer y actualizar por separado.
        const categoryResult = await client.query<CategoryRow>(
            `SELECT * FROM categories WHERE category_id = $1 AND project_id = $2 AND deleted_at IS NULL FOR UPDATE`,
            [body.category_id, projectId]
        );
        const category = categoryResult.rows[0];
        if (!category) throw new AppError(CATEGORY_ERRORS.CATEGORY_NOT_FOUND);

        let code: string;
        let baseProductCode: string | null = null;

        if (category.type === "fijo") {
            if (!body.code) throw new AppError(PRODUCT_ERRORS.CODE_REQUIRED);
            code = body.code;
        } else {
            if (!body.base_product_code) throw new AppError(PRODUCT_ERRORS.BASE_PRODUCT_CODE_REQUIRED);

            // `base_product_code` tiene que matchear un producto real y
            // activo de la categoría BASE de esta relacional (no
            // "cualquier categoría fija" — la base_category_id exacta
            // que le corresponde) — a propósito no un FK de motor (ver
            // diseño 2.2).
            const baseResult = await client.query(
                `SELECT 1 FROM products WHERE project_id = $1 AND category_id = $2 AND code = $3 AND deleted_at IS NULL`,
                [projectId, category.base_category_id, body.base_product_code]
            );
            if (baseResult.rowCount === 0) throw new AppError(PRODUCT_ERRORS.BASE_PRODUCT_NOT_FOUND);

            baseProductCode = body.base_product_code;
            code = `${category.prefix}-${body.base_product_code}`;
        }

        // Snapshot del display_id ANTES de incrementar — no se
        // recalcula después (diseño 2.2: "valor de
        // categories.next_display_id en el momento de crear este
        // producto").
        const displayId = category.next_display_id;
        await client.query(
            `UPDATE categories SET next_display_id = next_display_id + 1 WHERE category_id = $1`,
            [category.category_id]
        );

        const inserted = await client.query<ProductRow>(
            `INSERT INTO products
                (project_id, category_id, code, is_fixed, base_product_code, display_id, name, unit, created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            RETURNING *`,
            [
                projectId, category.category_id, code, category.type === "fijo", baseProductCode, displayId,
                body.name, body.unit.trim().toLowerCase(), user.user_id,
            ]
        );

        await client.query("COMMIT");
        return inserted.rows[0]!;
    } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof AppError) throw error;
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(PRODUCT_ERRORS.DUPLICATE_CODE);
        throw error;
    } finally {
        client.release();
    }
};

// A propósito solo name/unit — category_id/code/base_product_code/
// display_id/is_fixed son la identidad del producto, fijada al crearlo, y el
// modelo 3D tiene sus propios endpoints (ver más abajo) — ninguno de
// los dos forma parte de este PUT (ver schemas/almacen/product.schema.ts).
export const updateProductService = async (
    user: DecodedToken, { projectId, productId }: ProductIdParam, body: UpdateProductBody
): Promise<ProductRow> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    const { rows } = await pool.query<ProductRow>(
        `UPDATE products SET name = $1, unit = $2, updated_at = NOW(), updated_by = $3
        WHERE product_id = $4 AND project_id = $5 AND deleted_at IS NULL
        RETURNING *`,
        [body.name, body.unit.trim().toLowerCase(), user.user_id, productId, projectId]
    );
    const product = rows[0];
    if (!product) throw new AppError(PRODUCT_ERRORS.PRODUCT_NOT_FOUND);
    return product;
};

// Borrado lógico, bloqueado si tiene stock — mismo criterio atómico
// (UPDATE guardado con NOT EXISTS) que warehouse/rack: el RESTRICT de
// motor en bin_contents.product_id es el respaldo para un DELETE de
// verdad, que esta API nunca emite.
export const deleteProductService = async (
    user: DecodedToken, { projectId, productId }: ProductIdParam
): Promise<void> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "delete");

    const existsResult = await pool.query(
        `SELECT 1 FROM products WHERE product_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
        [productId, projectId]
    );
    if (existsResult.rowCount === 0) throw new AppError(PRODUCT_ERRORS.PRODUCT_NOT_FOUND);

    const { rowCount } = await pool.query(
        `UPDATE products SET deleted_at = NOW()
        WHERE product_id = $1 AND project_id = $2 AND deleted_at IS NULL
            AND NOT EXISTS (
                SELECT 1 FROM bin_contents bc WHERE bc.product_id = products.product_id AND bc.quantity > 0
            )`,
        [productId, projectId]
    );
    if (rowCount === 0) throw new AppError(PRODUCT_ERRORS.HAS_STOCK);
};

// Asigna un model_3d_asset_id YA EXISTENTE (mío, del sistema, o ya en
// uso en este proyecto — ver assertModel3DAssetVisible) — o `null`
// para sacar el modelo asignado. Subir un archivo NUEVO es otro
// endpoint aparte, sin proyecto (ver model-3d-asset.service.ts,
// uploadModel3DAssetService) — acá NUNCA se crea una fila de
// model_3d_assets, solo se referencia una existente. NUNCA borra la
// fila de model_3d_assets al sacarlo de un producto: sigue siendo del
// catálogo, puede estar en uso por otros productos o reasignarse
// después (ON DELETE RESTRICT en products.model_3d_asset_id es
// justamente lo que impediría borrar el asset del catálogo mientras
// algún producto lo siga usando, ver esquema).
export const assignProductModel3DService = async (
    user: DecodedToken, { projectId, productId }: ProductIdParam, body: AssignProductModel3DBody
): Promise<ProductWithModel3D> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");
    await assertProductInProject(pool, projectId, productId);

    if (body.model_3d_asset_id !== null) {
        await assertModel3DAssetVisible(pool, user, projectId, body.model_3d_asset_id);
    }

    const { rows } = await pool.query<ProductRowWithAssetJoin>(
        `UPDATE products p SET
            model_3d_asset_id = $1,
            model_3d_assigned_at = CASE WHEN $1::bigint IS NULL THEN NULL ELSE NOW() END,
            updated_at = NOW(), updated_by = $2
        WHERE p.product_id = $3 AND p.project_id = $4 AND p.deleted_at IS NULL
        RETURNING p.*,
            (SELECT ma.name FROM model_3d_assets ma WHERE ma.model_3d_asset_id = p.model_3d_asset_id) AS model_3d_name,
            (SELECT ma.format FROM model_3d_assets ma WHERE ma.model_3d_asset_id = p.model_3d_asset_id) AS model_3d_format`,
        [body.model_3d_asset_id, user.user_id, productId, projectId]
    );
    const product = rows[0];
    if (!product) throw new AppError(PRODUCT_ERRORS.PRODUCT_NOT_FOUND);
    return transformProductModel3D(product, projectId);
};
