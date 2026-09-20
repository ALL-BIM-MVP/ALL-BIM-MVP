// kardex-dates.test.js
//
// El Kardex muestra y filtra por la fecha del DOCUMENTO (movement_date =
// received_date / issue_date), no por el instante de registro (created_at) ni
// por medianoche UTC. Se fuerza la zona horaria de Lima: con la comparación
// anterior, to=2026-09-30 dejaba fuera los movimientos del 30.
//
// Correr: npm test   (desde backend/)
process.env.TZ = "America/Lima";
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import pool from "../dist/db/database.js";
import { createFixedCategoriesForProject } from "../dist/services/almacen/category.service.js";
import { emptyAlmacenContentService } from "../dist/services/almacen/almacen-content.service.js";
import { createSupplierService } from "../dist/services/almacen/supplier.service.js";
import { createGoodsReceiptService } from "../dist/services/almacen/goods-receipt.service.js";
import { createGoodsIssueService } from "../dist/services/almacen/goods-issue.service.js";
import { listInventoryMovementsService } from "../dist/services/almacen/inventory-movement.service.js";
import { ListInventoryMovementsQuerySchema } from "../dist/schemas/almacen/inventory-movement.schema.js";

const OWNER_USER_ID = 1;
const user = { user_id: OWNER_USER_ID, role_id: 4, email: "test@example.test" };
let projectId, productId, binId, supplierId;
const q = async (sql, params) => (await pool.query(sql, params)).rows;

before(async () => {
    projectId = Number((await q(
        `INSERT INTO projects (name, owner_id, created_by) VALUES ('[test] kardex ' || $1, $2, $2) RETURNING project_id`,
        [randomUUID(), OWNER_USER_ID]
    ))[0].project_id);
    const client = await pool.connect();
    try { await createFixedCategoriesForProject(client, projectId, OWNER_USER_ID); } finally { client.release(); }
    const [{ warehouse_style_id: styleId }] = await q(`SELECT warehouse_style_id FROM warehouse_styles LIMIT 1`);
    const [{ category_id: categoryId }] = await q(`SELECT category_id FROM categories WHERE project_id = $1 AND name = 'Partida'`, [projectId]);
    const [{ warehouse_id: warehouseId }] = await q(
        `INSERT INTO warehouses (project_id, warehouse_style_id, name, corner1_x, corner1_z, corner2_x, corner2_z, direction, area_m2, grid_width, grid_depth, created_by)
        VALUES ($1, $2, '[test] almacén', 0, 0, 10, 10, 'norte', 100, 5, 5, $3) RETURNING warehouse_id`, [projectId, styleId, OWNER_USER_ID]);
    const [{ rack_id: rackId }] = await q(
        `INSERT INTO racks (warehouse_id, name, corner1_x, corner1_z, corner2_x, corner2_z, levels, direction, created_by)
        VALUES ($1, '[test] estante', 0, 0, 1.3, 1.3, 1, 0, $2) RETURNING rack_id`, [warehouseId, OWNER_USER_ID]);
    binId = (await q(`INSERT INTO bins (rack_id, bay, level, face, location_label, name) VALUES ($1, 0, 0, 0, 'A1', 'A1') RETURNING bin_id`, [rackId]))[0].bin_id;
    productId = (await q(
        `INSERT INTO products (project_id, category_id, code, is_fixed, display_id, name, unit, created_by)
        VALUES ($1, $2, 'K-1', true, 1, '[test] producto', 'und', $3) RETURNING product_id`, [projectId, categoryId, OWNER_USER_ID]))[0].product_id;
    supplierId = (await createSupplierService(user, { projectId }, { ruc: "20123456789", name: "[test] proveedor" })).supplier_id;
});

after(async () => {
    try {
        try { await emptyAlmacenContentService(user, { projectId }); } catch { /* ya vacío */ }
        await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
    } finally { await pool.end(); }
});

const receipt = (number, receivedDate, quantity) => createGoodsReceiptService(user, { projectId }, {
    supplier_id: supplierId, entry_type: "rapida", delivery_note_series: "T001", delivery_note_number: String(number), delivery_note_date: "2026-09-01",
    ...(receivedDate ? { received_date: receivedDate } : {}),
    items: [{ product_id: productId, total_quantity: quantity, locations: [{ bin_id: binId, quantity }] }],
});
// El ingreso sin received_date (test 2) cae en "hoy": se deja fuera de las comparaciones de rango.
let defaultDate = null;
const dates = async (query) => (await listInventoryMovementsService(user, { projectId }, query))
    .map((m) => m.movement_date).filter((d) => d !== defaultDate);

test("el movimiento toma la fecha del documento (no la de registro)", async () => {
    await receipt(1, "2026-09-12", 50);
    await receipt(2, "2026-09-30", 20);
    await createGoodsIssueService(user, { projectId }, {
        destination_sector: "S1", destination_level: "N1", destination_block: "B1", recipient_name: "Juan", recipient_dni: "12345678",
        issue_date: "2026-10-01", items: [{ product_id: productId, total_quantity: 5, locations: [{ bin_id: binId, quantity: 5 }] }],
    });
    assert.deepEqual(await dates({}), ["2026-10-01", "2026-09-30", "2026-09-12"], "más reciente primero, con la fecha del documento");
});

test("sin received_date, el movimiento usa la fecha que guardó el ingreso (hoy)", async () => {
    const created = await receipt(3, undefined, 1);
    const [{ movement_date: stored }] = await q(
        `SELECT to_char(movement_date, 'YYYY-MM-DD') AS movement_date FROM inventory_movements WHERE reference_document_type = 'goods_receipt' AND reference_document_id = $1`,
        [created.goods_receipt_id]
    );
    assert.equal(stored, created.received_date);
    defaultDate = stored;
});

test("from/to son inclusivos y por día: to=2026-09-30 incluye lo del 30; from=2026-09-13 excluye el 12", async () => {
    const inRange = await dates({ product_id: productId, from: "2026-09-01", to: "2026-09-30" });
    assert.deepEqual(inRange, ["2026-09-30", "2026-09-12"]);
    assert.deepEqual(await dates({ from: "2026-09-13", to: "2026-09-30" }), ["2026-09-30"]);
    assert.deepEqual(await dates({ from: "2026-09-12", to: "2026-09-12" }), ["2026-09-12"], "un solo día");
    assert.deepEqual(await dates({ from: "2026-10-02" }).then((d) => d.filter((x) => x < "2026-10-02")), [], "from sin to");
});

test("Zod: from/to solo aceptan AAAA-MM-DD", () => {
    assert.equal(ListInventoryMovementsQuerySchema.safeParse({ from: "2026-09-01", to: "2026-09-30" }).success, true);
    for (const bad of ["01/09/2026", "2026-9-1", "2026-13-01", "ayer", "2026-09-01T00:00:00Z"]) {
        assert.equal(ListInventoryMovementsQuerySchema.safeParse({ from: bad }).success, false, bad);
    }
});
