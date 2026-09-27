// inventory-transfer.service.test.js
//
// Test de integración (BD real) de B11 (2026-09-26, ver
// docs/almacen-ingreso-productos/09-roadmap-correcciones-2026-09-26.md, Fase D): traspaso entre
// casillas. Es una ENVOLTURA sobre una corrección de 2 líneas — por eso este archivo se limita a
// probar la envoltura en sí (que arma bien las 2 líneas y que rechaza lo mismo que rechazaría una
// corrección); las reglas de fondo (no negativo, línea del documento, casilla del proyecto,
// permisos) ya están cubiertas a fondo en inventory-adjustments.service.test.js.
//
// Correr: npm test   (desde backend/)
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pool from "../dist/db/database.js";
import { createFixedCategoriesForProject } from "../dist/services/almacen/category.service.js";
import { emptyAlmacenContentService } from "../dist/services/almacen/almacen-content.service.js";
import { createGoodsReceiptService } from "../dist/services/almacen/goods-receipt.service.js";
import { createGoodsIssueService } from "../dist/services/almacen/goods-issue.service.js";
import { transferGoodsIssueService, transferGoodsReceiptService } from "../dist/services/almacen/inventory-adjustment.service.js";
import { TransferGoodsIssueBodySchema, TransferGoodsReceiptBodySchema } from "../dist/schemas/almacen/inventory-adjustment.schema.js";

const OWNER_USER_ID = 1;
const asOwner = { user_id: OWNER_USER_ID, role_id: 4, email: "test@example.test" };
const asUser = (userId) => ({ user_id: userId, role_id: 4, email: "test@example.test" });
const codeOf = (expected) => (error) => error?.response?.code === expected;

let projectId;
let binA, binB;
let productId;
let supplierId;

const createUser = async (label) => (await pool.query(
    `INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, 'x', 4) RETURNING user_id`,
    [`[test] ${label}`, `test-${label}-${randomUUID()}@example.test`]
)).rows[0].user_id;

before(async () => {
    projectId = Number((await pool.query(
        `INSERT INTO projects (name, owner_id, created_by) VALUES ('[test] traspaso', $1, $1) RETURNING project_id`, [OWNER_USER_ID]
    )).rows[0].project_id);

    const client = await pool.connect();
    try { await createFixedCategoriesForProject(client, projectId, OWNER_USER_ID); } finally { client.release(); }

    const q = async (sql, params) => (await pool.query(sql, params)).rows;
    const [{ warehouse_style_id: styleId }] = await q(`SELECT warehouse_style_id FROM warehouse_styles LIMIT 1`);
    const [{ category_id: categoryId }] = await q(`SELECT category_id FROM categories WHERE project_id = $1 AND name = 'Partida'`, [projectId]);
    const [{ warehouse_id: warehouseId }] = await q(
        `INSERT INTO warehouses (project_id, warehouse_style_id, name, corner1_x, corner1_z, corner2_x, corner2_z, direction, area_m2, grid_width, grid_depth, created_by)
        VALUES ($1, $2, '[test] almacén', 0, 0, 10, 10, 'norte', 100, 5, 5, $3) RETURNING warehouse_id`, [projectId, styleId, OWNER_USER_ID]
    );
    const [{ rack_id: rackId }] = await q(
        `INSERT INTO racks (warehouse_id, name, corner1_x, corner1_z, corner2_x, corner2_z, bays, depth, levels, direction, created_by)
        VALUES ($1, '[test] estante', 0, 0, 2, 1, 2, 1, 1, 0, $2) RETURNING rack_id`, [warehouseId, OWNER_USER_ID]
    );
    binA = (await q(`INSERT INTO bins (rack_id, bay, level, face, location_label, name) VALUES ($1, 0, 0, 0, 'A1', 'A1') RETURNING bin_id`, [rackId]))[0].bin_id;
    binB = (await q(`INSERT INTO bins (rack_id, bay, level, face, location_label, name) VALUES ($1, 1, 0, 0, 'A2', 'A2') RETURNING bin_id`, [rackId]))[0].bin_id;
    productId = (await q(
        `INSERT INTO products (project_id, category_id, code, is_fixed, display_id, name, unit, created_by)
        VALUES ($1, $2, 'T-1', true, 1, '[test] producto', 'und', $3) RETURNING product_id`, [projectId, categoryId, OWNER_USER_ID]
    ))[0].product_id;
    supplierId = (await q(
        `INSERT INTO suppliers (project_id, ruc, name, created_by) VALUES ($1, '20123456789', '[test] proveedor', $2) RETURNING supplier_id`,
        [projectId, OWNER_USER_ID]
    ))[0].supplier_id;
});

after(async () => {
    await emptyAlmacenContentService(asOwner, { projectId });
    await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
    await pool.end();
});

test("Zod: origen y destino no pueden ser la misma casilla; cantidad tiene que ser positiva; motivo obligatorio", () => {
    const base = { reason: "Estaba en la casilla equivocada", goods_receipt_item_id: 1, from_bin_id: 2, to_bin_id: 3, quantity: 10 };
    assert.equal(TransferGoodsReceiptBodySchema.safeParse(base).success, true);
    assert.equal(TransferGoodsReceiptBodySchema.safeParse({ ...base, to_bin_id: 2 }).success, false, "misma casilla");
    assert.equal(TransferGoodsReceiptBodySchema.safeParse({ ...base, quantity: 0 }).success, false);
    assert.equal(TransferGoodsReceiptBodySchema.safeParse({ ...base, quantity: -5 }).success, false);
    assert.equal(TransferGoodsReceiptBodySchema.safeParse({ ...base, reason: "" }).success, false);
    assert.equal(TransferGoodsIssueBodySchema.safeParse({ ...base, goods_issue_item_id: 1, goods_receipt_item_id: undefined }).success, true);
});

test("traspaso en un INGRESO: mueve cantidad de una casilla a otra sin cambiar lo efectivo ni duplicar stock", async () => {
    const rc = await createGoodsReceiptService(asOwner, { projectId }, {
        supplier_id: supplierId, entry_type: "rapida", delivery_note_series: "T001", delivery_note_number: "00000001", delivery_note_date: "2026-09-10",
        items: [{ product_id: productId, total_quantity: 100, locations: [{ bin_id: binA, quantity: 100 }] }],
    });
    const itemId = Number(rc.items[0].goods_receipt_item_id);

    const adj = await transferGoodsReceiptService(asOwner, { projectId }, rc.goods_receipt_id, {
        reason: "Se guardó en la casilla equivocada", goods_receipt_item_id: itemId, from_bin_id: binA, to_bin_id: binB, quantity: 40,
    });
    assert.equal(adj.kind, "correccion", "por dentro sigue siendo una corrección común");
    assert.equal(adj.items.length, 2);
    assert.deepEqual(adj.items.map((i) => Number(i.quantity_delta)).sort((a, b) => a - b), [-40, 40]);

    const stock = async (bin) => Number((await pool.query(`SELECT COALESCE(SUM(quantity),0) AS t FROM bin_contents WHERE bin_id = $1 AND product_id = $2`, [bin, productId])).rows[0].t);
    assert.equal(await stock(binA), 60);
    assert.equal(await stock(binB), 40);
    assert.equal((await stock(binA)) + (await stock(binB)), 100, "el total no cambia, solo la ubicación");

    const movements = (await pool.query(
        `SELECT type, quantity::float AS quantity, bin_id FROM inventory_movements WHERE product_id = $1 AND reference_document_type = 'inventory_adjustment' ORDER BY inventory_movement_id`,
        [productId]
    )).rows;
    assert.deepEqual(movements, [{ type: "salida", quantity: 40, bin_id: binA }, { type: "entrada", quantity: 40, bin_id: binB }]);
});

test("traspasar más de lo que hay en origen se rechaza igual que una corrección (no queda nada a medias)", async () => {
    const rc = await createGoodsReceiptService(asOwner, { projectId }, {
        supplier_id: supplierId, entry_type: "rapida", delivery_note_series: "T001", delivery_note_number: "00000002", delivery_note_date: "2026-09-10",
        items: [{ product_id: productId, total_quantity: 15, locations: [{ bin_id: binA, quantity: 15 }] }],
    });
    const itemId = Number(rc.items[0].goods_receipt_item_id);
    await assert.rejects(
        transferGoodsReceiptService(asOwner, { projectId }, rc.goods_receipt_id, {
            reason: "x", goods_receipt_item_id: itemId, from_bin_id: binA, to_bin_id: binB, quantity: 999,
        }),
        codeOf("INVENTORY_ADJUSTMENT_EFFECTIVE_BELOW_ZERO")
    );
});

test("traspaso en un VALE (goods-issue) y permiso: solo 'configure' lo puede pedir", async () => {
    const rc = await createGoodsReceiptService(asOwner, { projectId }, {
        supplier_id: supplierId, entry_type: "rapida", delivery_note_series: "T001", delivery_note_number: "00000003", delivery_note_date: "2026-09-10",
        items: [{ product_id: productId, total_quantity: 50, locations: [{ bin_id: binA, quantity: 50 }] }],
    });
    const issue = await createGoodsIssueService(asOwner, { projectId }, {
        number: "VS-TRANSFER-1", destination_sector: "Torre A", destination_level: "Piso 3", destination_block: "Bloque B",
        recipient_name: "Juan Pérez", recipient_dni: "12345678", issue_date: "2026-09-15",
        items: [{ product_id: productId, total_quantity: 20, locations: [{ bin_id: binA, quantity: 20 }] }],
    });
    const itemId = Number(issue.items[0].goods_issue_item_id);

    const editorId = await createUser("editor-transfer");
    const memberId = (await pool.query(
        `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) RETURNING project_member_id`, [projectId, editorId]
    )).rows[0].project_member_id;
    await pool.query(
        `INSERT INTO project_member_module_roles (project_member_id, module_id, module_role_id)
        SELECT $1, m.module_id, mr.module_role_id FROM modules m INNER JOIN module_roles mr ON mr.module_id = m.module_id
        WHERE m.code = 'almacen' AND mr.name = 'Editor'`,
        [memberId]
    );
    await assert.rejects(
        transferGoodsIssueService(asUser(editorId), { projectId }, issue.goods_issue_id, {
            reason: "x", goods_issue_item_id: itemId, from_bin_id: binA, to_bin_id: binB, quantity: 5,
        }),
        (e) => e?.statusCode === 403,
        "un Editor tiene 'process' pero no 'configure'"
    );

    const adj = await transferGoodsIssueService(asOwner, { projectId }, issue.goods_issue_id, {
        reason: "Se había marcado la casilla equivocada", goods_issue_item_id: itemId, from_bin_id: binA, to_bin_id: binB, quantity: 5,
    });
    assert.equal(adj.reference_document.type, "goods_issue");

    await pool.query(`DELETE FROM project_member_module_roles WHERE project_member_id = $1`, [memberId]);
    await pool.query(`DELETE FROM project_members WHERE project_member_id = $1`, [memberId]);
    await pool.query(`DELETE FROM users WHERE user_id = $1`, [editorId]);
});
