// product-summary.test.js
//
// Toda respuesta de Almacén que muestra un producto lo trae con el mismo resumen
// (product_id, category_id, code, display_id, name, unit). `display_id` es el ID
// que ve el usuario: antes faltaba en los ítems de ingresos y vales, en el Kardex
// y en los documentos previos.
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
import { listProductsService, getProductByIdService } from "../dist/services/almacen/product.service.js";
import { getGoodsReceiptByIdService } from "../dist/services/almacen/goods-receipt.service.js";
import { getGoodsIssueByIdService } from "../dist/services/almacen/goods-issue.service.js";
import { createPurchaseRequisitionService } from "../dist/services/almacen/purchase-requisition.service.js";
import { getProductHistoryService } from "../dist/services/almacen/product-history.service.js";
import { getTraceabilityService } from "../dist/services/almacen/traceability.service.js";
import { getRackByIdService } from "../dist/services/almacen/rack.service.js";
let vsSeq = 0;
const vsn = () => `VS-${++vsSeq}`;


const OWNER_USER_ID = 1;
const user = { user_id: OWNER_USER_ID, role_id: 4, email: "test@example.test" };
let projectId, productId, binId, supplierId;
const q = async (sql, params) => (await pool.query(sql, params)).rows;

before(async () => {
    projectId = Number((await q(
        `INSERT INTO projects (name, owner_id, created_by) VALUES ('[test] product-summary ' || $1, $2, $2) RETURNING project_id`,
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
        VALUES ($1, $2, 'K-1', true, 7, '[test] producto', 'und', $3) RETURNING product_id`, [projectId, categoryId, OWNER_USER_ID]))[0].product_id;
    supplierId = (await createSupplierService(user, { projectId }, { ruc: "20123456789", name: "[test] proveedor" })).supplier_id;
});

after(async () => {
    try {
        try { await emptyAlmacenContentService(user, { projectId }); } catch { /* ya vacío */ }
        await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
    } finally { await pool.end(); }
});


const expected = () => ({ product_id: productId, code: "K-1", display_id: 7, name: "[test] producto", unit: "und" });
const assertSummary = (p, where) => {
    assert.ok(p, `${where}: falta product`);
    assert.equal(String(p.product_id), String(productId), where);
    assert.equal(p.code, "K-1", where);
    assert.equal(p.display_id, 7, `${where}: display_id`);
    assert.equal(p.name, "[test] producto", where);
    assert.equal(p.unit, "und", where);
    assert.ok(p.category_id !== undefined, `${where}: category_id`);
};

test("el producto lleva display_id en ingresos, vales, Kardex, documentos, historia, trazabilidad y casillas", async () => {
    const created = await createGoodsReceiptService(user, { projectId }, {
        supplier_id: supplierId, entry_type: "rapida", delivery_note_series: "T001", delivery_note_number: "1", delivery_note_date: "2026-09-01",
        received_date: "2026-09-02", items: [{ product_id: productId, total_quantity: 10, locations: [{ bin_id: binId, quantity: 10 }] }],
    });
    const receiptDetail = await getGoodsReceiptByIdService(user, { projectId, goodsReceiptId: created.goods_receipt_id });
    assertSummary(receiptDetail.items[0].product, "ingreso");

    const issue = await createGoodsIssueService(user, { projectId }, {
        number: vsn(), destination_sector: "S1", destination_level: "N1", destination_block: "B1", recipient_name: "Juan", recipient_dni: "12345678",
        issue_date: "2026-09-03", items: [{ product_id: productId, total_quantity: 4, locations: [{ bin_id: binId, quantity: 4 }] }],
    });
    const issueDetail = await getGoodsIssueByIdService(user, { projectId, goodsIssueId: issue.goods_issue_id });
    assertSummary(issueDetail.items[0].product, "vale");

    const movements = await listInventoryMovementsService(user, { projectId }, {});
    assert.ok(movements.length >= 2);
    for (const m of movements) assertSummary(m.product, "kardex");

    const requisition = await createPurchaseRequisitionService(user, { projectId }, {
        number: "REQ-1", requisition_date: "2026-09-01", requester: "Obra",
        items: [{ product_id: productId, description: "algo", quantity_requested: 5 }],
    });
    assertSummary(requisition.items[0].product, "requerimiento");

    const history = await getProductHistoryService(user, { projectId, productId }, {});
    assertSummary(history.product, "hoja de vida");

    const trace = await getTraceabilityService(user, { projectId, documentType: "goods-receipt", documentId: created.goods_receipt_id }, { direction: "all" });
    assertSummary(trace.threads[0].product, "trazabilidad");

    const warehouseId = (await q(`SELECT warehouse_id FROM warehouses WHERE project_id = $1`, [projectId]))[0].warehouse_id;
    const rackId = (await q(`SELECT rack_id FROM racks WHERE warehouse_id = $1`, [warehouseId]))[0].rack_id;
    const rack = await getRackByIdService(user, { projectId, warehouseId, rackId });
    const content = rack.bins.find((b) => String(b.bin_id) === String(binId)).contents[0];
    assert.equal(content.display_id, 7, "contenido de casilla");
    assert.match(content.quantity, /^\d+\.\d{6}$/, "las cantidades viajan como texto con 6 decimales también dentro de la casilla");
    assert.equal(content.unit, "und");
});

test("la lista y el detalle de productos traen display_id", async () => {
    const list = await listProductsService(user, { projectId }, {});
    assert.equal(list.find((p) => String(p.product_id) === String(productId)).display_id, 7);
    const detail = await getProductByIdService(user, { projectId, productId });
    assert.equal(detail.display_id, 7);
    for (const product of [list.find((p) => String(p.product_id) === String(productId)), detail]) {
        assert.match(product.total_stock, /^\d+\.\d{6}$/, "total_stock siempre con 6 decimales (también en 0)");
    }
    const empty = await getProductByIdService(user, { projectId, productId: (await q(
        `INSERT INTO products (project_id, category_id, code, is_fixed, display_id, name, unit, created_by)
        SELECT project_id, category_id, 'K-2', true, 8, '[test] sin stock', 'und', created_by FROM products WHERE product_id = $1 RETURNING product_id`, [productId]))[0].product_id });
    assert.equal(empty.total_stock, "0.000000");
});

// --- Descripción por línea de la guía y número del vale -------------------------------------
import { voidGoodsIssueService } from "../dist/services/almacen/inventory-adjustment.service.js";

const rapid = (number, item) => createGoodsReceiptService(user, { projectId }, {
    supplier_id: supplierId, entry_type: "rapida", delivery_note_series: "T002", delivery_note_number: String(number),
    delivery_note_date: "2026-09-05", received_date: "2026-09-06",
    items: [{ product_id: productId, total_quantity: 3, locations: [{ bin_id: binId, quantity: 3 }], ...item }],
});

test("la línea del ingreso lleva descripción: la enviada, o el nombre del producto si no se envía", async () => {
    const withText = await rapid(10, { description: "Cemento según la guía" });
    assert.equal(withText.items[0].description, "Cemento según la guía");
    const without = await rapid(11, {});
    assert.equal(without.items[0].description, "[test] producto");
});

test("Zod: la descripción de la línea del ingreso no puede ir vacía", async () => {
    const { CreateGoodsReceiptBodySchema } = await import("../dist/schemas/almacen/goods-receipt.schema.js");
    const base = { supplier_id: 1, entry_type: "rapida", delivery_note_series: "T001", delivery_note_number: "1", delivery_note_date: "2026-09-01",
        items: [{ product_id: 1, total_quantity: 1, locations: [{ bin_id: 1, quantity: 1 }] }] };
    assert.equal(CreateGoodsReceiptBodySchema.safeParse(base).success, true);
    assert.equal(CreateGoodsReceiptBodySchema.safeParse({ ...base, items: [{ ...base.items[0], description: "  " }] }).success, false);
    assert.equal(CreateGoodsReceiptBodySchema.safeParse({ ...base, items: [{ ...base.items[0], description: "x".repeat(301) }] }).success, false);
});

const issue = (number) => createGoodsIssueService(user, { projectId }, {
    number, destination_sector: "S1", destination_level: "N1", destination_block: "B1", recipient_name: "Juan", recipient_dni: "12345678",
    issue_date: "2026-09-10", items: [{ product_id: productId, total_quantity: 1, locations: [{ bin_id: binId, quantity: 1 }] }],
});

test("el vale lleva su número: único por proyecto entre los no anulados; el de un vale anulado se puede reutilizar", async () => {
    const first = await issue("VS-77");
    assert.equal(first.number, "VS-77");
    await assert.rejects(issue("VS-77"), (e) => e.response?.code === "GOODS_ISSUE_DUPLICATE_NUMBER" && e.statusCode === 409);
    await voidGoodsIssueService(user, { projectId }, first.goods_issue_id, { reason: "prueba" });
    const again = await issue("VS-77");
    assert.equal(again.number, "VS-77");
});

test("Zod: el número del vale es obligatorio y de hasta 30 caracteres", async () => {
    const { CreateGoodsIssueBodySchema } = await import("../dist/schemas/almacen/goods-issue.schema.js");
    const base = { destination_sector: "S", destination_level: "N", destination_block: "B", recipient_name: "J", recipient_dni: "12345678",
        issue_date: "2026-09-10", items: [{ product_id: 1, total_quantity: 1, locations: [{ bin_id: 1, quantity: 1 }] }] };
    assert.equal(CreateGoodsIssueBodySchema.safeParse(base).success, false, "sin número");
    assert.equal(CreateGoodsIssueBodySchema.safeParse({ ...base, number: "VS-01" }).success, true);
    assert.equal(CreateGoodsIssueBodySchema.safeParse({ ...base, number: "x".repeat(31) }).success, false);
});

test("trazabilidad: RUC del proveedor, fecha de guía y de recepción, precio estimado y descripción de la línea de ingreso", async () => {
    const requisition = await createPurchaseRequisitionService(user, { projectId }, {
        number: "REQ-2", requisition_date: "2026-09-01", requester: "Obra",
        items: [{ product_id: productId, description: "con precio", quantity_requested: 5, estimated_unit_price: 30 }],
    });
    const trace = await getTraceabilityService(user, { projectId, documentType: "requisition", documentId: requisition.purchase_requisition_id }, { direction: "forward" });
    const thread = trace.threads.find((t) => t.requisition_items.length);
    assert.equal(Number(thread.requisition_items[0].estimated_unit_price), 30);

    const receipt = await rapid(20, { description: "Descripción de la guía" });
    const back = await getTraceabilityService(user, { projectId, documentType: "goods-receipt", documentId: receipt.goods_receipt_id }, { direction: "all" });
    const doc = back.documents.goods_receipts[0];
    assert.equal(doc.supplier.ruc, "20123456789");
    assert.equal(doc.date, "2026-09-06", "fecha de recepción");
    assert.equal(doc.delivery_note_date, "2026-09-05", "fecha de la guía");
    assert.equal(back.threads[0].receipt_items[0].description, "Descripción de la guía");
});
