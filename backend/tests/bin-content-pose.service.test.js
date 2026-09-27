// bin-content-pose.service.test.js
//
// Test de integración (BD real) de la Fase A de
// docs/almacen-ingreso-productos/09-roadmap-correcciones-2026-09-26.md: ajustar cómo se
// ve un contenido dentro de su casilla (posición/rotación/escala) sin tocar cuánto hay.
// PATCH .../bins/:binId/contents/:binContentId — nunca cambia quantity, nunca genera un
// movimiento de Kardex, y no necesita el permiso "configure" (no es un dato de
// inventario, ver bin.service.ts).
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
import { updateBinContentPoseService } from "../dist/services/almacen/bin.service.js";
import { UpdateBinContentPoseBodySchema } from "../dist/schemas/almacen/bin.schema.js";

const OWNER_USER_ID = 1;
const asOwner = { user_id: OWNER_USER_ID, role_id: 4, email: "test@example.test" };
const asUser = (userId) => ({ user_id: userId, role_id: 4, email: "test@example.test" });
const codeOf = (expected) => (error) => error?.response?.code === expected;

let projectId;
let warehouseId, rackId, binId, otherBinId;
let productId;
let supplierId;
let binContentId;

const createUser = async (label) => (await pool.query(
    `INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, 'x', 4) RETURNING user_id`,
    [`[test] ${label}`, `test-${label}-${randomUUID()}@example.test`]
)).rows[0].user_id;

before(async () => {
    projectId = Number((await pool.query(
        `INSERT INTO projects (name, owner_id, created_by) VALUES ('[test] pose', $1, $1) RETURNING project_id`, [OWNER_USER_ID]
    )).rows[0].project_id);

    const client = await pool.connect();
    try { await createFixedCategoriesForProject(client, projectId, OWNER_USER_ID); } finally { client.release(); }

    const q = async (sql, params) => (await pool.query(sql, params)).rows;
    const [{ warehouse_style_id: styleId }] = await q(`SELECT warehouse_style_id FROM warehouse_styles LIMIT 1`);
    const [{ category_id: categoryId }] = await q(`SELECT category_id FROM categories WHERE project_id = $1 AND name = 'Partida'`, [projectId]);
    [{ warehouse_id: warehouseId }] = await q(
        `INSERT INTO warehouses (project_id, warehouse_style_id, name, corner1_x, corner1_z, corner2_x, corner2_z, direction, area_m2, grid_width, grid_depth, created_by)
        VALUES ($1, $2, '[test] almacén', 0, 0, 10, 10, 'norte', 100, 5, 5, $3) RETURNING warehouse_id`, [projectId, styleId, OWNER_USER_ID]
    );
    [{ rack_id: rackId }] = await q(
        `INSERT INTO racks (warehouse_id, name, corner1_x, corner1_z, corner2_x, corner2_z, bays, depth, levels, direction, created_by)
        VALUES ($1, '[test] estante', 0, 0, 2, 1, 2, 1, 1, 0, $2) RETURNING rack_id`, [warehouseId, OWNER_USER_ID]
    );
    binId = (await q(`INSERT INTO bins (rack_id, bay, level, face, location_label, name) VALUES ($1, 0, 0, 0, 'A1', 'A1') RETURNING bin_id`, [rackId]))[0].bin_id;
    otherBinId = (await q(`INSERT INTO bins (rack_id, bay, level, face, location_label, name) VALUES ($1, 1, 0, 0, 'A2', 'A2') RETURNING bin_id`, [rackId]))[0].bin_id;
    productId = (await q(
        `INSERT INTO products (project_id, category_id, code, is_fixed, display_id, name, unit, created_by)
        VALUES ($1, $2, 'T-1', true, 1, '[test] producto', 'und', $3) RETURNING product_id`, [projectId, categoryId, OWNER_USER_ID]
    ))[0].product_id;
    supplierId = (await q(
        `INSERT INTO suppliers (project_id, ruc, name, created_by) VALUES ($1, '20123456789', '[test] proveedor', $2) RETURNING supplier_id`,
        [projectId, OWNER_USER_ID]
    ))[0].supplier_id;

    // Ingreso real: crea el bin_content con pose en 0 por defecto.
    await createGoodsReceiptService(asOwner, { projectId }, {
        supplier_id: supplierId, entry_type: "rapida",
        delivery_note_series: "T001", delivery_note_number: "00000001", delivery_note_date: "2026-09-10",
        items: [{ product_id: productId, total_quantity: 10, locations: [{ bin_id: binId, quantity: 10 }] }],
    });
    binContentId = Number((await q(`SELECT bin_content_id FROM bin_contents WHERE bin_id = $1`, [binId]))[0].bin_content_id);
});

after(async () => {
    await emptyAlmacenContentService(asOwner, { projectId });
    await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
    await pool.end();
});

test("Zod: al menos un campo; scale tiene que ser positivo; no acepta quantity ni otro campo ajeno", () => {
    assert.equal(UpdateBinContentPoseBodySchema.safeParse({}).success, false, "vacío no alcanza");
    assert.equal(UpdateBinContentPoseBodySchema.safeParse({ scale: 0 }).success, false, "scale tiene que ser > 0");
    assert.equal(UpdateBinContentPoseBodySchema.safeParse({ rotation_y: 1.57 }).success, true);
    assert.equal(UpdateBinContentPoseBodySchema.safeParse({ quantity: 5 }).success, false, "esto no cambia cantidades");
});

test("recién creado: pose en 0 (scale null) — el ingreso nunca la toca", async () => {
    const { rows } = await pool.query(
        `SELECT position_x, position_y, position_z, rotation_x, rotation_y, rotation_z, scale FROM bin_contents WHERE bin_content_id = $1`,
        [binContentId]
    );
    const row = rows[0];
    for (const f of ["position_x", "position_y", "position_z", "rotation_x", "rotation_y", "rotation_z"]) assert.equal(Number(row[f]), 0);
    assert.equal(row.scale, null);
});

test("PATCH: solo cambia los campos enviados, el resto queda igual", async () => {
    const result = await updateBinContentPoseService(asOwner, { projectId, warehouseId, rackId, binId, binContentId }, {
        rotation_y: 1.5708, scale: 0.8,
    });
    assert.equal(result.bin_content_id, String(binContentId));
    assert.equal(Number(result.rotation_y), 1.5708);
    assert.equal(Number(result.scale), 0.8);
    assert.equal(Number(result.position_x), 0, "no se envió: sigue en 0");
    assert.equal(Number(result.rotation_x), 0, "no se envió: sigue en 0");

    // Un segundo PATCH que solo toca position_x no debe resetear rotation_y/scale ya puestos.
    const second = await updateBinContentPoseService(asOwner, { projectId, warehouseId, rackId, binId, binContentId }, { position_x: 0.3 });
    assert.equal(Number(second.position_x), 0.3);
    assert.equal(Number(second.rotation_y), 1.5708, "lo del PATCH anterior se conserva");
    assert.equal(Number(second.scale), 0.8, "lo del PATCH anterior se conserva");
});

test("PATCH no toca la cantidad ni genera Kardex", async () => {
    const before_ = await pool.query(`SELECT quantity FROM bin_contents WHERE bin_content_id = $1`, [binContentId]);
    const movementsBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM inventory_movements WHERE product_id = $1`, [productId])).rows[0].n;

    await updateBinContentPoseService(asOwner, { projectId, warehouseId, rackId, binId, binContentId }, { rotation_z: 3.1416 });

    const after_ = await pool.query(`SELECT quantity FROM bin_contents WHERE bin_content_id = $1`, [binContentId]);
    const movementsAfter = (await pool.query(`SELECT COUNT(*)::int AS n FROM inventory_movements WHERE product_id = $1`, [productId])).rows[0].n;
    assert.equal(after_.rows[0].quantity, before_.rows[0].quantity);
    assert.equal(movementsAfter, movementsBefore, "ajustar la pose no es un movimiento de inventario");
});

test("un bin_content que no está en esa casilla da 404 BIN_CONTENT_NOT_FOUND", async () => {
    await assert.rejects(
        updateBinContentPoseService(asOwner, { projectId, warehouseId, rackId, binId: otherBinId, binContentId }, { scale: 1 }),
        codeOf("BIN_CONTENT_NOT_FOUND")
    );
});

test("permiso: alguien sin rol de Almacén no puede ajustar la pose", async () => {
    const plainId = await createUser("plain-pose");
    const memberId = (await pool.query(
        `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) RETURNING project_member_id`, [projectId, plainId]
    )).rows[0].project_member_id;
    await assert.rejects(
        updateBinContentPoseService(asUser(plainId), { projectId, warehouseId, rackId, binId, binContentId }, { scale: 1 }),
        (e) => e?.statusCode === 403
    );
    await pool.query(`DELETE FROM project_members WHERE project_member_id = $1`, [memberId]);
    await pool.query(`DELETE FROM users WHERE user_id = $1`, [plainId]);
});
