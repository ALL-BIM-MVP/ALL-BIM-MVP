// suppliers (proveedores por proyecto) — Fase 2 de
// docs/almacen-ingreso-productos/05-roadmap.md. El RUC y la razón social
// viven SOLO acá; los documentos referencian supplier_id.
import pool from "../../db/database.js";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { SUPPLIER_ERRORS } from "../../models/errors/almacen/supplier.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type {
    CreateSupplierBody, ListSuppliersQuery, SupplierIdParam, UpdateSupplierBody,
} from "../../schemas/almacen/supplier.schema.js";
import type { Supplier, SupplierRow } from "../../models/almacen/supplier.models.js";

const UNIQUE_VIOLATION = "23505";

// Cuántos documentos usan a un proveedor — ingresos, cotizaciones, órdenes de compra y facturas; cada tabla
// de documento nueva (órdenes de compra, cotizaciones, facturas) se suma
// en los DOS fragmentos de abajo. Fragmentos fijos armados en el servidor
// (nunca entrada de usuario), mismo criterio que VISIBILITY_CLAUSE en
// model-3d-asset.service.ts. `s` es el alias de suppliers en las
// consultas de lectura; `suppliers` va sin alias en los UPDATE guardados.
// Cotizaciones, órdenes y facturas: solo las ACTIVAS (una dada de baja no ata al proveedor).
const DOCUMENTS_COUNT = `(
    (SELECT COUNT(*) FROM goods_receipts gr WHERE gr.supplier_id = s.supplier_id)
    + (SELECT COUNT(*) FROM quotations q WHERE q.supplier_id = s.supplier_id AND q.deleted_at IS NULL)
    + (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.supplier_id AND po.deleted_at IS NULL)
    + (SELECT COUNT(*) FROM invoices v WHERE v.supplier_id = s.supplier_id AND v.deleted_at IS NULL)
)::int`;
const HAS_NO_DOCUMENTS = `(
    NOT EXISTS (SELECT 1 FROM goods_receipts gr WHERE gr.supplier_id = suppliers.supplier_id)
    AND NOT EXISTS (SELECT 1 FROM quotations q WHERE q.supplier_id = suppliers.supplier_id AND q.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM purchase_orders po WHERE po.supplier_id = suppliers.supplier_id AND po.deleted_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM invoices v WHERE v.supplier_id = suppliers.supplier_id AND v.deleted_at IS NULL)
)`;

export const getSupplierOrThrow = async (
    client: Pool | PoolClient, projectId: number, supplierId: number
): Promise<Supplier> => {
    const { rows } = await client.query<Supplier>(
        `SELECT s.*, ${DOCUMENTS_COUNT} AS documents_count
        FROM suppliers s
        WHERE s.supplier_id = $1 AND s.project_id = $2 AND s.deleted_at IS NULL`,
        [supplierId, projectId]
    );
    const supplier = rows[0];
    if (!supplier) throw new AppError(SUPPLIER_ERRORS.SUPPLIER_NOT_FOUND);
    return supplier;
};

// Lo usan los documentos (ingresos hoy) para validar que el proveedor
// sea de ESTE proyecto y esté activo, antes de insertar nada.
export const assertSupplierInProject = async (
    client: Pool | PoolClient, projectId: number, supplierId: number
): Promise<void> => {
    const { rowCount } = await client.query(
        `SELECT 1 FROM suppliers WHERE supplier_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
        [supplierId, projectId]
    );
    if (rowCount === 0) throw new AppError(SUPPLIER_ERRORS.SUPPLIER_NOT_FOUND);
};

// Con ?search= sirve de autocompletado: si lo escrito son solo dígitos
// (espacios y guiones se ignoran) busca por el comienzo del RUC Y por
// nombre; si no, solo por parte del nombre. Los comodines de LIKE que
// escriba el usuario (% _ \) se escapan: se buscan tal cual.
export const listSuppliersService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, { search }: ListSuppliersQuery
): Promise<Supplier[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const params: unknown[] = [projectId];
    let filter = "";
    if (search) {
        const digits = search.replace(/[\s-]/g, "");
        const nameLike = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
        if (/^\d+$/.test(digits)) {
            params.push(`${digits}%`, nameLike);
            filter = `AND (s.ruc LIKE $2 OR s.name ILIKE $3)`;
        } else {
            params.push(nameLike);
            filter = `AND s.name ILIKE $2`;
        }
    }

    const { rows } = await pool.query<Supplier>(
        `SELECT s.*, ${DOCUMENTS_COUNT} AS documents_count
        FROM suppliers s
        WHERE s.project_id = $1 AND s.deleted_at IS NULL ${filter}
        ORDER BY s.name`,
        params
    );
    return rows;
};

export const getSupplierByIdService = async (
    user: DecodedToken, { projectId, supplierId }: SupplierIdParam
): Promise<Supplier> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");
    return getSupplierOrThrow(pool, projectId, supplierId);
};

export const createSupplierService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreateSupplierBody
): Promise<Supplier> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    try {
        const { rows } = await pool.query<SupplierRow>(
            `INSERT INTO suppliers (project_id, ruc, name, created_by)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [projectId, body.ruc, body.name, user.user_id]
        );
        return { ...rows[0]!, documents_count: 0 };
    } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(SUPPLIER_ERRORS.DUPLICATE_RUC);
        throw error;
    }
};

// PUT reemplaza los dos campos. El nombre (razón social) se puede editar
// siempre; el RUC solo mientras el proveedor no tenga documentos. Esa
// regla va dentro del propio UPDATE (atómica): un ingreso creado justo
// entre "chequear" y "actualizar" también la respeta. Cada edición deja
// updated_at/updated_by.
export const updateSupplierService = async (
    user: DecodedToken, { projectId, supplierId }: SupplierIdParam, body: UpdateSupplierBody
): Promise<Supplier> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");

    await getSupplierOrThrow(pool, projectId, supplierId);

    try {
        const { rowCount } = await pool.query(
            `UPDATE suppliers
            SET ruc = $1, name = $2, updated_at = NOW(), updated_by = $3
            WHERE supplier_id = $4 AND project_id = $5 AND deleted_at IS NULL
                AND (ruc = $1 OR ${HAS_NO_DOCUMENTS})`,
            [body.ruc, body.name, user.user_id, supplierId, projectId]
        );
        // El proveedor existía hace un instante: si no se actualizó nada, lo
        // que lo frenó fue el candado del RUC.
        if (rowCount === 0) throw new AppError(SUPPLIER_ERRORS.RUC_LOCKED);
    } catch (error) {
        if (error instanceof AppError) throw error;
        const code = (error as { code?: string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(SUPPLIER_ERRORS.DUPLICATE_RUC);
        throw error;
    }

    return getSupplierOrThrow(pool, projectId, supplierId);
};

// Baja lógica — un proveedor es parte del registro de auditoría: darlo
// de baja exige "configure" (Administrador del módulo) o ser dueño/
// administrador del proyecto; el Editor no puede. Se bloquea si algún
// documento lo usa (UPDATE guardado, atómico). Al darlo de baja se libera
// su RUC (índice único parcial sobre los activos).
export const deleteSupplierService = async (
    user: DecodedToken, { projectId, supplierId }: SupplierIdParam
): Promise<void> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "configure");

    await getSupplierOrThrow(pool, projectId, supplierId);

    const { rowCount } = await pool.query(
        `UPDATE suppliers SET deleted_at = NOW(), updated_at = NOW(), updated_by = $3
        WHERE supplier_id = $1 AND project_id = $2 AND deleted_at IS NULL AND ${HAS_NO_DOCUMENTS}`,
        [supplierId, projectId, user.user_id]
    );
    if (rowCount === 0) throw new AppError(SUPPLIER_ERRORS.HAS_DOCUMENTS);
};
