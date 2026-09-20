// suppliers.service.test.js
//
// Test de integración (BD real) de la Fase 2 de
// docs/almacen-ingreso-productos/05-roadmap.md: proveedores por proyecto,
// y el ingreso que ahora referencia supplier_id (con serie/número de guía,
// dos fechas y cantidad según guía). Corre contra dist/ ya compilado, sin
// mocks del driver.
//
// Los tests son un FLUJO en orden, no casos independientes: comparten el
// proyecto, los usuarios y los proveedores de prueba.
//
// Correr: npm test   (desde backend/)
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pool from "../dist/db/database.js";
import { createFixedCategoriesForProject } from "../dist/services/almacen/category.service.js";
import { emptyAlmacenContentService } from "../dist/services/almacen/almacen-content.service.js";
import {
    createSupplierService, deleteSupplierService, getSupplierByIdService, listSuppliersService, updateSupplierService,
} from "../dist/services/almacen/supplier.service.js";
import { createGoodsReceiptService, getGoodsReceiptByIdService, listGoodsReceiptsService } from "../dist/services/almacen/goods-receipt.service.js";
import { CreateSupplierBodySchema } from "../dist/schemas/almacen/supplier.schema.js";
import { CreateGoodsReceiptBodySchema } from "../dist/schemas/almacen/goods-receipt.schema.js";

const OWNER_USER_ID = 1;
const asUser = (userId) => ({ user_id: userId, role_id: 4, email: "test@example.test" });
const codeOf = (expected) => (error) => error?.response?.code === expected;

let projectId;
let otherProjectId;
let editorId;   // miembro con rol Editor de Almacén (view/upload/process/delete, SIN configure)
let plainId;    // miembro sin rol (solo "ver")
let outsiderId; // no es miembro
let productId;
let binId;
const state = {};

const createUser = async (label) => (await pool.query(
    `INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, 'x', 4) RETURNING user_id`,
    [`[test] ${label}`, `test-${label}-${randomUUID()}@example.test`]
)).rows[0].user_id;

before(async () => {
    const mkProject = async (name) => Number((await pool.query(
        `INSERT INTO projects (name, owner_id, created_by) VALUES ($1, $2, $2) RETURNING project_id`, [name, OWNER_USER_ID]
    )).rows[0].project_id);
    projectId = await mkProject("[test] suppliers");
    otherProjectId = await mkProject("[test] suppliers (otro proyecto)");

    const client = await pool.connect();
    try { await createFixedCategoriesForProject(client, projectId, OWNER_USER_ID); } finally { client.release(); }

    editorId = await createUser("editor");
    plainId = await createUser("plain");
    outsiderId = await createUser("outsider");
    const memberIds = {};
    for (const userId of [editorId, plainId]) {
        memberIds[userId] = (await pool.query(
            `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) RETURNING project_member_id`, [projectId, userId]
        )).rows[0].project_member_id;
    }
    await pool.query(
        `INSERT INTO project_member_module_roles (project_member_id, module_id, module_role_id)
        SELECT $1, m.module_id, mr.module_role_id
        FROM modules m INNER JOIN module_roles mr ON mr.module_id = m.module_id
        WHERE m.code = 'almacen' AND mr.name = 'Editor'`,
        [memberIds[editorId]]
    );

    // Un producto y una casilla para poder registrar un ingreso real.
    const q = async (sql, params) => (await pool.query(sql, params)).rows;
    const [{ warehouse_style_id: styleId }] = await q(`SELECT warehouse_style_id FROM warehouse_styles LIMIT 1`);
    const [{ category_id: categoryId }] = await q(`SELECT category_id FROM categories WHERE project_id = $1 AND name = 'Partida'`, [projectId]);
    const [{ warehouse_id: warehouseId }] = await q(
        `INSERT INTO warehouses (project_id, warehouse_style_id, name, corner1_x, corner1_z, corner2_x, corner2_z, direction, area_m2, grid_width, grid_depth, created_by)
        VALUES ($1, $2, '[test] almacén', 0, 0, 10, 10, 'norte', 100, 5, 5, $3) RETURNING warehouse_id`, [projectId, styleId, OWNER_USER_ID]
    );
    const [{ rack_id: rackId }] = await q(
        `INSERT INTO racks (warehouse_id, name, corner1_x, corner1_z, corner2_x, corner2_z, levels, direction, created_by)
        VALUES ($1, '[test] estante', 0, 0, 1.3, 1.3, 1, 0, $2) RETURNING rack_id`, [warehouseId, OWNER_USER_ID]
    );
    binId = (await q(`INSERT INTO bins (rack_id, bay, level, face, location_label, name) VALUES ($1, 0, 0, 0, 'A1', 'A1') RETURNING bin_id`, [rackId]))[0].bin_id;
    productId = (await q(
        `INSERT INTO products (project_id, category_id, code, is_fixed, display_id, name, unit, created_by)
        VALUES ($1, $2, 'T-1', true, 1, '[test] producto', 'und', $3) RETURNING product_id`, [projectId, categoryId, OWNER_USER_ID]
    ))[0].product_id;
});

after(async () => {
    try {
        for (const id of [projectId, otherProjectId]) {
            try { await emptyAlmacenContentService(asUser(OWNER_USER_ID), { projectId: id }); } catch { /* ya vacío */ }
            await pool.query(`DELETE FROM projects WHERE project_id = $1`, [id]);
        }
        await pool.query(`DELETE FROM users WHERE user_id = ANY($1::int[])`, [[editorId, plainId, outsiderId]]);
    } finally {
        await pool.end();
    }
});

const receiptBody = (overrides = {}) => ({
    supplier_id: state.supplierA?.supplier_id,
    entry_type: "rapida",
    delivery_note_series: "T001",
    delivery_note_number: "00000123",
    delivery_note_date: "2026-09-10",
    items: [{ product_id: productId, total_quantity: 97, quantity_per_delivery_note: 100, locations: [{ bin_id: binId, quantity: 97 }] }],
    ...overrides,
});

test("Zod: el RUC se normaliza (espacios y guiones) y solo acepta 11 dígitos", () => {
    assert.equal(CreateSupplierBodySchema.parse({ ruc: " 20-123456789 ", name: " Proveedor SAC " }).ruc, "20123456789");
    assert.equal(CreateSupplierBodySchema.parse({ ruc: "20123456789", name: " Proveedor SAC " }).name, "Proveedor SAC");
    for (const bad of ["2012345678", "201234567890", "2012345678a", ""]) {
        assert.equal(CreateSupplierBodySchema.safeParse({ ruc: bad, name: "x" }).success, false, `RUC inválido: "${bad}"`);
    }
    assert.equal(CreateSupplierBodySchema.safeParse({ ruc: "20123456789", name: "  " }).success, false);
});

test("Zod: la guía se valida como serie + número (formato SUNAT) y no admite texto libre", () => {
    const base = { supplier_id: 1, entry_type: "rapida", delivery_note_date: "2026-09-10", items: receiptBody().items };
    const ok = CreateGoodsReceiptBodySchema.parse({ ...base, delivery_note_series: " t001 ", delivery_note_number: "123" });
    assert.equal(ok.delivery_note_series, "T001", "la serie se normaliza a mayúsculas");
    for (const [series, number] of [["GR-1", "123"], ["T001", "123456789"], ["T001", "12a"], ["", "123"], ["T00001", "123"], ["T001", ""]]) {
        assert.equal(
            CreateGoodsReceiptBodySchema.safeParse({ ...base, delivery_note_series: series, delivery_note_number: number }).success,
            false, `guía inválida: "${series}" / "${number}"`
        );
    }
    assert.equal(CreateGoodsReceiptBodySchema.safeParse({ delivery_note_date: "2026-09-10", items: base.items, delivery_note_series: "T001", delivery_note_number: "1" }).success, false,
        "supplier_id es obligatorio");
    // Las fechas "solo día" son texto AAAA-MM-DD válido de calendario (no un Date ni una fecha-hora).
    const withDate = (delivery_note_date, extra = {}) => CreateGoodsReceiptBodySchema.safeParse({
        ...base, delivery_note_series: "T001", delivery_note_number: "1", delivery_note_date, ...extra,
    }).success;
    assert.equal(withDate("2026-09-10"), true);
    assert.equal(withDate("2026-09-10", { received_date: "2026-09-12" }), true);
    for (const bad of ["10/09/2026", "2026-13-40", "2026-02-30", "2026-09-10T00:00:00Z", ""]) {
        assert.equal(withDate(bad), false, `fecha inválida: "${bad}"`);
    }
    assert.equal(withDate("2026-09-10", { received_date: "12-09-2026" }), false);
});

test("crear proveedor: queda con documents_count 0; el RUC duplicado se rechaza (409)", async () => {
    state.supplierA = await createSupplierService(asUser(OWNER_USER_ID), { projectId }, { ruc: "20123456789", name: "Cementos del Sur SAC" });
    assert.equal(state.supplierA.ruc, "20123456789");
    assert.equal(state.supplierA.documents_count, 0);
    assert.equal(state.supplierA.created_by, OWNER_USER_ID);

    await assert.rejects(
        createSupplierService(asUser(OWNER_USER_ID), { projectId }, { ruc: "20123456789", name: "Otro nombre" }),
        codeOf("SUPPLIER_DUPLICATE_RUC")
    );
    // El mismo RUC en OTRO proyecto es válido (los proveedores son por proyecto).
    const inOther = await createSupplierService(asUser(OWNER_USER_ID), { projectId: otherProjectId }, { ruc: "20123456789", name: "Cementos del Sur SAC" });
    state.supplierOtherProject = inOther;
    assert.notEqual(inOther.supplier_id, state.supplierA.supplier_id);
});

test("permisos: un Editor crea y edita; un miembro sin rol no; un ajeno recibe 404", async () => {
    state.supplierB = await createSupplierService(asUser(editorId), { projectId }, { ruc: "20987654321", name: "Aceros Andinos SA" });
    assert.equal(state.supplierB.created_by, editorId);

    await assert.rejects(
        createSupplierService(asUser(plainId), { projectId }, { ruc: "20111111111", name: "No debe crearse" }),
        codeOf("INSUFFICIENT_PERMISSIONS")
    );
    await assert.rejects(
        createSupplierService(asUser(outsiderId), { projectId }, { ruc: "20111111111", name: "No debe crearse" }),
        codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED")
    );
    // Leer solo pide "ver": un miembro sin rol sí lista.
    assert.equal((await listSuppliersService(asUser(plainId), { projectId }, {})).length, 2);
});

test("búsqueda (autocompletado): por RUC completo o por comienzo, por nombre, sin importar mayúsculas, y sin comodines", async () => {
    const find = async (search) => (await listSuppliersService(asUser(OWNER_USER_ID), { projectId }, { search })).map((s) => s.ruc);

    assert.deepEqual(await find("20123456789"), ["20123456789"], "RUC completo");
    assert.deepEqual(await find("2012"), ["20123456789"], "comienzo del RUC");
    assert.deepEqual(await find("20-1234"), ["20123456789"], "RUC con guion");
    assert.deepEqual((await find("20")).sort(), ["20123456789", "20987654321"], "comienzo común: trae los dos");
    assert.deepEqual(await find("andinos"), ["20987654321"], "parte del nombre, sin importar mayúsculas");
    assert.deepEqual(await find("zzz"), [], "sin coincidencias");
    assert.deepEqual(await find("%"), [], "% se busca como texto, no como comodín");
    assert.deepEqual(await find("_"), [], "_ se busca como texto, no como comodín");
    assert.deepEqual(await find("9876"), [], "el RUC se busca por el COMIENZO, no por el medio");
});

test("obtener por id y aislamiento entre proyectos", async () => {
    const got = await getSupplierByIdService(asUser(OWNER_USER_ID), { projectId, supplierId: state.supplierA.supplier_id });
    assert.equal(got.name, "Cementos del Sur SAC");
    await assert.rejects(
        getSupplierByIdService(asUser(OWNER_USER_ID), { projectId, supplierId: state.supplierOtherProject.supplier_id }),
        codeOf("SUPPLIER_NOT_FOUND")
    );
});

test("editar: el nombre y (sin documentos) el RUC se pueden cambiar, dejando updated_by; un RUC ya existente se rechaza", async () => {
    const renamed = await updateSupplierService(asUser(editorId), { projectId, supplierId: state.supplierB.supplier_id },
        { ruc: "20987654321", name: "Aceros Andinos S.A.C." });
    assert.equal(renamed.name, "Aceros Andinos S.A.C.");
    assert.equal(renamed.updated_by, editorId);
    assert.ok(renamed.updated_at);

    const fixedRuc = await updateSupplierService(asUser(editorId), { projectId, supplierId: state.supplierB.supplier_id },
        { ruc: "20555555555", name: "Aceros Andinos S.A.C." });
    assert.equal(fixedRuc.ruc, "20555555555", "sin documentos, el RUC se puede corregir");

    await assert.rejects(
        updateSupplierService(asUser(editorId), { projectId, supplierId: state.supplierB.supplier_id },
            { ruc: "20123456789", name: "Aceros Andinos S.A.C." }),
        codeOf("SUPPLIER_DUPLICATE_RUC")
    );
    await assert.rejects(
        updateSupplierService(asUser(plainId), { projectId, supplierId: state.supplierB.supplier_id },
            { ruc: "20555555555", name: "no" }),
        codeOf("INSUFFICIENT_PERMISSIONS")
    );
});

test("ingreso: proveedor embebido, serie/número de guía, fecha de recepción por defecto y cantidad según guía", async () => {
    const receipt = await createGoodsReceiptService(asUser(editorId), { projectId }, receiptBody());
    state.receipt = receipt;

    assert.deepEqual(receipt.supplier, { supplier_id: state.supplierA.supplier_id, ruc: "20123456789", name: "Cementos del Sur SAC" });
    assert.equal(receipt.delivery_note_series, "T001");
    assert.equal(receipt.delivery_note_number, "00000123");
    assert.equal(receipt.delivery_note_date, "2026-09-10", "la fecha \"solo día\" sale como texto AAAA-MM-DD, sin desfase de zona horaria");
    const today = (await pool.query(`SELECT CURRENT_DATE::text AS d`)).rows[0].d;
    assert.equal(receipt.received_date, today, "received_date toma el valor por defecto (hoy)");
    assert.equal("supplier_ruc" in receipt || "supplier_name" in receipt || "purchase_date" in receipt, false, "las columnas viejas ya no existen");

    const item = receipt.items[0];
    assert.equal(Number(item.total_quantity), 97, "lo recibido");
    assert.equal(Number(item.quantity_per_delivery_note), 100, "lo que decía la guía");
    assert.equal(item.locations.length, 1);

    // Una línea SIN cantidad según guía queda en null; y received_date se puede indicar.
    const second = await createGoodsReceiptService(asUser(OWNER_USER_ID), { projectId }, receiptBody({
        delivery_note_number: "124", received_date: "2026-09-12",
        items: [{ product_id: productId, total_quantity: 5, locations: [{ bin_id: binId, quantity: 5 }] }],
    }));
    assert.equal(second.items[0].quantity_per_delivery_note, null);
    assert.equal(second.received_date, "2026-09-12");

    const listed = await listGoodsReceiptsService(asUser(plainId), { projectId }, {});
    assert.equal(listed.length, 2);
    assert.ok(listed.every((r) => r.supplier.ruc === "20123456789"), "el listado también trae el proveedor");
    assert.equal((await getGoodsReceiptByIdService(asUser(plainId), { projectId, goodsReceiptId: receipt.goods_receipt_id })).supplier.name, "Cementos del Sur SAC");
});

test("ingreso: el proveedor tiene que ser de este proyecto (404) y no se crea nada a medias", async () => {
    const before = (await pool.query(`SELECT COUNT(*)::int AS n FROM goods_receipts WHERE project_id = $1`, [projectId])).rows[0].n;
    await assert.rejects(
        createGoodsReceiptService(asUser(OWNER_USER_ID), { projectId }, receiptBody({ supplier_id: state.supplierOtherProject.supplier_id })),
        codeOf("SUPPLIER_NOT_FOUND")
    );
    await assert.rejects(
        createGoodsReceiptService(asUser(OWNER_USER_ID), { projectId }, receiptBody({ supplier_id: 999999999 })),
        codeOf("SUPPLIER_NOT_FOUND")
    );
    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM goods_receipts WHERE project_id = $1`, [projectId])).rows[0].n, before);
});

test("con documentos: documents_count sube, el RUC queda bloqueado (el nombre no) y la baja se rechaza", async () => {
    const supplier = await getSupplierByIdService(asUser(OWNER_USER_ID), { projectId, supplierId: state.supplierA.supplier_id });
    assert.equal(supplier.documents_count, 2);

    await assert.rejects(
        updateSupplierService(asUser(OWNER_USER_ID), { projectId, supplierId: state.supplierA.supplier_id },
            { ruc: "20111111111", name: "Cementos del Sur SAC" }),
        codeOf("SUPPLIER_RUC_LOCKED")
    );
    const renamed = await updateSupplierService(asUser(OWNER_USER_ID), { projectId, supplierId: state.supplierA.supplier_id },
        { ruc: "20123456789", name: "Cementos del Sur S.A.C." });
    assert.equal(renamed.name, "Cementos del Sur S.A.C.", "el nombre sí se edita aunque tenga documentos");
    assert.equal(renamed.ruc, "20123456789");

    await assert.rejects(
        deleteSupplierService(asUser(OWNER_USER_ID), { projectId, supplierId: state.supplierA.supplier_id }),
        codeOf("SUPPLIER_HAS_DOCUMENTS")
    );
});

test("baja: la auditoría no la elimina un Editor (403); el dueño sí, y el RUC queda libre", async () => {
    // Editor: tiene "delete" del módulo pero no "configure".
    await assert.rejects(
        deleteSupplierService(asUser(editorId), { projectId, supplierId: state.supplierB.supplier_id }),
        codeOf("INSUFFICIENT_PERMISSIONS")
    );
    assert.equal((await pool.query(`SELECT deleted_at FROM suppliers WHERE supplier_id = $1`, [state.supplierB.supplier_id])).rows[0].deleted_at, null);

    await deleteSupplierService(asUser(OWNER_USER_ID), { projectId, supplierId: state.supplierB.supplier_id });
    assert.ok((await pool.query(`SELECT deleted_at FROM suppliers WHERE supplier_id = $1`, [state.supplierB.supplier_id])).rows[0].deleted_at, "baja lógica: la fila sigue, con deleted_at");

    await assert.rejects(getSupplierByIdService(asUser(OWNER_USER_ID), { projectId, supplierId: state.supplierB.supplier_id }), codeOf("SUPPLIER_NOT_FOUND"));
    assert.equal((await listSuppliersService(asUser(OWNER_USER_ID), { projectId }, {})).length, 1, "ya no aparece en el listado");

    const reused = await createSupplierService(asUser(OWNER_USER_ID), { projectId }, { ruc: "20555555555", name: "RUC reutilizado" });
    assert.ok(reused.supplier_id, "el RUC de un proveedor dado de baja se puede volver a usar");
});
