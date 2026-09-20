// Vaciar Almacén y saber si está vacío — Fase 0 de
// docs/almacen-ingreso-productos/05-roadmap.md. Almacén protege su
// jerarquía con ON DELETE RESTRICT (nadie borra por accidente una
// estantería con mercadería), y esos candados también trababan
// DELETE FROM projects (verificado 2026-09-19). En vez de quitar los
// candados, los procesos se separan: vaciar Almacén es una acción
// explícita y protegida (esta), y eliminar el proyecto exige que ya
// esté vacío (ver deleteProjectByIdService en projects.service.ts).
import fs from "node:fs";
import pool from "../../db/database.js";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { ALMACEN_CONTENT_ERRORS } from "../../models/errors/almacen/almacen-content.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission, assertProjectAdmin } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type { AlmacenContentCounts, AlmacenContentSummary } from "../../models/almacen/almacen-content.models.js";

// Fragmentos fijos armados en el servidor (nunca entrada de usuario),
// mismo criterio que VISIBILITY_CLAUSE en model-3d-asset.service.ts.
// Todos usan $1 = projectId. Los estantes y casillas no tienen
// project_id propio: cuelgan de un almacén.
const PROJECT_BINS = `
    SELECT b.bin_id FROM bins b
    INNER JOIN racks r ON r.rack_id = b.rack_id
    INNER JOIN warehouses w ON w.warehouse_id = r.warehouse_id
    WHERE w.project_id = $1`;
const PROJECT_PRODUCTS = `SELECT product_id FROM products WHERE project_id = $1`;

export const countAlmacenContent = async (
    client: Pool | PoolClient, projectId: number
): Promise<AlmacenContentSummary> => {
    const { rows } = await client.query<AlmacenContentCounts>(
        `SELECT
            (SELECT COUNT(*) FROM suppliers WHERE project_id = $1)::int AS suppliers,
            (SELECT COUNT(*) FROM inventory_adjustments WHERE project_id = $1)::int AS inventory_adjustments,
            (SELECT COUNT(*) FROM invoices WHERE project_id = $1)::int AS invoices,
            (SELECT COUNT(*) FROM purchase_orders WHERE project_id = $1)::int AS purchase_orders,
            (SELECT COUNT(*) FROM quotations WHERE project_id = $1)::int AS quotations,
            (SELECT COUNT(*) FROM purchase_requisitions WHERE project_id = $1)::int AS purchase_requisitions,
            (SELECT COUNT(*) FROM warehouses WHERE project_id = $1)::int AS warehouses,
            (SELECT COUNT(*) FROM racks r INNER JOIN warehouses w ON w.warehouse_id = r.warehouse_id
                WHERE w.project_id = $1)::int AS racks,
            (SELECT COUNT(*) FROM (${PROJECT_BINS}) pb)::int AS bins,
            (SELECT COUNT(*) FROM products WHERE project_id = $1)::int AS products,
            (SELECT COUNT(*) FROM goods_receipts WHERE project_id = $1)::int AS goods_receipts,
            (SELECT COUNT(*) FROM goods_issues WHERE project_id = $1)::int AS goods_issues,
            (SELECT COUNT(*) FROM inventory_movements WHERE product_id IN (${PROJECT_PRODUCTS}))::int AS inventory_movements,
            (SELECT COUNT(*) FROM files f INNER JOIN modules m ON m.module_id = f.module_id
                WHERE f.project_id = $1 AND m.code = $2)::int AS files`,
        [projectId, ALMACEN_MODULE_CODE]
    );
    const counts = rows[0]!;
    return { ...counts, is_empty: Object.values(counts).every((n) => n === 0) };
};

// Lo usa deleteProjectByIdService: si queda algo de Almacén, el
// proyecto no se elimina.
export const assertAlmacenEmpty = async (
    client: Pool | PoolClient, projectId: number
): Promise<void> => {
    const summary = await countAlmacenContent(client, projectId);
    if (!summary.is_empty) throw new AppError(ALMACEN_CONTENT_ERRORS.NOT_EMPTY);
};

export const getAlmacenSummaryService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<AlmacenContentSummary> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return countAlmacenContent(pool, projectId);
};

// Solo dueño o administrador del proyecto: un Editor tiene el permiso
// "delete" del módulo pero la auditoría no la elimina un Editor.
// Borra TODO lo de Almacén de ese proyecto (incluso lo dado de baja
// lógica y todo el historial) en UNA transacción, de abajo hacia
// arriba respetando los RESTRICT (orden verificado 2026-09-19 contra
// datos completos, incluidos grupos de fusión de casillas). NO borra las
// 3 categorías fijas (pertenecen al proyecto y no hay endpoint para
// recrearlas: sin ellas Almacén quedaría inservible en un proyecto que
// sigue vivo) — solo reinicia sus contadores de ID a 1; tampoco toca
// model_3d_assets (son del usuario, no del proyecto). Devuelve cuánto
// se eliminó de cada cosa.
//
// Cada tabla nueva que Almacén guarde por proyecto se suma acá (y a
// countAlmacenContent). También se borran los ARCHIVOS del proyecto cuyo
// módulo es Almacén (files.module_id) — filas dentro de la transacción,
// bytes en disco DESPUÉS del COMMIT; los archivos de otros módulos
// (Metrados) no se tocan.
export const emptyAlmacenContentService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<AlmacenContentCounts> => {
    await assertProjectAdmin(projectId, user.user_id);

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const movements = await client.query(
            `DELETE FROM inventory_movements WHERE product_id IN (${PROJECT_PRODUCTS})`, [projectId]
        );
        // Ajustes de inventario (Fase 10): sus líneas se van solas (CASCADE); van ANTES de los
        // ingresos y vales que corrigen (RESTRICT).
        const adjustments = await client.query(`DELETE FROM inventory_adjustments WHERE project_id = $1`, [projectId]);
        // Los ítems y sus repartos por casilla se van solos (ON DELETE CASCADE).
        const receipts = await client.query(`DELETE FROM goods_receipts WHERE project_id = $1`, [projectId]);
        const issues = await client.query(`DELETE FROM goods_issues WHERE project_id = $1`, [projectId]);
        // Facturas (baja lógica incluida); sus líneas se van solas (CASCADE). Van
        // ANTES de las órdenes y de los proveedores (RESTRICT).
        const invoices = await client.query(`DELETE FROM invoices WHERE project_id = $1`, [projectId]);
        // Órdenes de compra (baja lógica incluida); sus líneas se van solas (CASCADE).
        // Van ANTES de cotizaciones, requerimientos y proveedores (RESTRICT).
        const orders = await client.query(`DELETE FROM purchase_orders WHERE project_id = $1`, [projectId]);
        // Cotizaciones (baja lógica incluida); sus líneas se van solas (CASCADE).
        // Van ANTES de los requerimientos y de los proveedores (RESTRICT).
        const quotations = await client.query(`DELETE FROM quotations WHERE project_id = $1`, [projectId]);
        // Requerimientos (con baja lógica incluida); sus líneas se van solas
        // (CASCADE). Van ANTES de products (RESTRICT desde sus líneas) y de
        // files (RESTRICT desde file_id).
        const requisitions = await client.query(`DELETE FROM purchase_requisitions WHERE project_id = $1`, [projectId]);
        // Los proveedores (incluidos los dados de baja) se borran DESPUÉS de los
        // ingresos: goods_receipts.supplier_id es RESTRICT. Los documentos
        // futuros que también los referencien se borran antes de esta línea.
        const suppliers = await client.query(`DELETE FROM suppliers WHERE project_id = $1`, [projectId]);

        // Contenido de casillas, incluido el de grupos fusionados
        // (bin_merge_*: sin endpoints todavía, pero la tabla existe).
        await client.query(
            `DELETE FROM bin_contents
            WHERE bin_id IN (${PROJECT_BINS})
                OR bin_merge_group_id IN (
                    SELECT m.bin_merge_group_id FROM bin_merge_members m WHERE m.bin_id IN (${PROJECT_BINS})
                )`,
            [projectId]
        );
        // Sus miembros se van solos (ON DELETE CASCADE).
        await client.query(
            `DELETE FROM bin_merge_groups
            WHERE bin_merge_group_id IN (
                SELECT m.bin_merge_group_id FROM bin_merge_members m WHERE m.bin_id IN (${PROJECT_BINS})
            )`,
            [projectId]
        );

        const bins = await client.query(`DELETE FROM bins WHERE bin_id IN (${PROJECT_BINS})`, [projectId]);
        const racks = await client.query(
            `DELETE FROM racks WHERE warehouse_id IN (SELECT warehouse_id FROM warehouses WHERE project_id = $1)`,
            [projectId]
        );
        const warehouses = await client.query(`DELETE FROM warehouses WHERE project_id = $1`, [projectId]);
        const products = await client.query(`DELETE FROM products WHERE project_id = $1`, [projectId]);

        await client.query(`UPDATE categories SET next_display_id = 1 WHERE project_id = $1`, [projectId]);

        // Los documentos de Almacén (fases siguientes del roadmap) van a
        // referenciar files: se borran ANTES de esta línea.
        const files = await client.query<{ file_path: string; thumbnail_path: string | null }>(
            `DELETE FROM files
            WHERE project_id = $1 AND module_id = (SELECT module_id FROM modules WHERE code = $2)
            RETURNING file_path, thumbnail_path`,
            [projectId, ALMACEN_MODULE_CODE]
        );

        await client.query("COMMIT");

        // Recién con el COMMIT hecho se borran los bytes: si la
        // transacción hubiera fallado, no queremos haber perdido archivos
        // cuyas filas siguen existiendo.
        for (const file of files.rows) {
            await fs.promises.rm(file.file_path, { force: true });
            if (file.thumbnail_path) await fs.promises.rm(file.thumbnail_path, { force: true });
        }

        return {
            suppliers: suppliers.rowCount ?? 0,
            inventory_adjustments: adjustments.rowCount ?? 0,
            invoices: invoices.rowCount ?? 0,
            purchase_orders: orders.rowCount ?? 0,
            quotations: quotations.rowCount ?? 0,
            purchase_requisitions: requisitions.rowCount ?? 0,
            warehouses: warehouses.rowCount ?? 0,
            racks: racks.rowCount ?? 0,
            bins: bins.rowCount ?? 0,
            products: products.rowCount ?? 0,
            goods_receipts: receipts.rowCount ?? 0,
            goods_issues: issues.rowCount ?? 0,
            inventory_movements: movements.rowCount ?? 0,
            files: files.rowCount ?? 0,
        };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
