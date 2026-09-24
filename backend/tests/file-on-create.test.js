// file-on-create.test.js
//
// Un documento se puede crear YA con su archivo (`file_id` opcional en el POST de crear):
// es el camino de la lectura por IA (se sube el archivo, se lee, el usuario confirma y el
// documento nace con su archivo). Archivo y documento se guardan juntos: si algo falla, no
// queda ni el uno ni el vínculo, y el archivo sigue libre.
//
// Correr: npm test   (desde backend/)
process.env.TZ = "America/Lima";
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createQuotationService } from "../dist/services/almacen/quotation.service.js";
import { createPurchaseOrderService } from "../dist/services/almacen/purchase-order.service.js";
import { createInvoiceService } from "../dist/services/almacen/invoice.service.js";
import { CreateInvoiceBodySchema } from "../dist/schemas/almacen/invoice.schema.js";
import { CreateGoodsReceiptBodySchema } from "../dist/schemas/almacen/goods-receipt.schema.js";


import pool from "../dist/db/database.js";
import { createFixedCategoriesForProject } from "../dist/services/almacen/category.service.js";
import { emptyAlmacenContentService } from "../dist/services/almacen/almacen-content.service.js";
import { createSupplierService } from "../dist/services/almacen/supplier.service.js";
import { createGoodsReceiptService } from "../dist/services/almacen/goods-receipt.service.js";
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
        `INSERT INTO projects (name, owner_id, created_by) VALUES ('[test] file-on-create ' || $1, $2, $2) RETURNING project_id`,
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


const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "file-on-create-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));
const makeFile = async (moduleCode = "almacen") => (await q(
    `INSERT INTO files (project_id, module_id, file_type, name, file_path, file_size, mime_type, uploaded_by)
    VALUES ($1, (SELECT module_id FROM modules WHERE code = $2), 'pdf', 'doc.pdf', $3, 9, 'application/pdf', $4) RETURNING file_id`,
    [projectId, moduleCode, path.join(TMP, randomUUID() + ".pdf"), OWNER_USER_ID]))[0].file_id;
const ctx = () => ({ projectId });
const codeOf = (c) => (e) => e?.response?.code === c;
let n = 0; const num = () => `D-${++n}`;

const creators = {
    requisición: (file_id) => createPurchaseRequisitionService(user, ctx(), { number: num(), requisition_date: "2026-09-01", requester: "Obra", file_id,
        items: [{ product_id: productId, description: "x", quantity_requested: 1 }] }),
    cotización: async (file_id) => { const r = await createPurchaseRequisitionService(user, ctx(), { number: num(), requisition_date: "2026-09-01", requester: "Obra", items: [{ product_id: productId, description: "x", quantity_requested: 1 }] });
        return createQuotationService(user, ctx(), { supplier_id: supplierId, purchase_requisition_id: r.purchase_requisition_id, number: num(), quotation_date: "2026-09-02", currency: "PEN", file_id,
            items: [{ purchase_requisition_item_id: r.items[0].purchase_requisition_item_id, description: "x", quantity_quoted: 1, line_total: 10 }] }); },
    orden: (file_id) => createPurchaseOrderService(user, ctx(), { supplier_id: supplierId, number: num(), order_date: "2026-09-02", currency: "PEN", file_id,
        items: [{ product_id: productId, description: "x", quantity_ordered: 1, line_total: 10 }] }),
    factura: (file_id) => createInvoiceService(user, ctx(), { supplier_id: supplierId, series: "F001", number: String(++n), invoice_date: "2026-09-03", currency: "PEN", file_id,
        items: [{ product_id: productId, description: "x", quantity_invoiced: 1, line_total: 10 }] }),
    ingreso: (file_id) => createGoodsReceiptService(user, ctx(), { supplier_id: supplierId, entry_type: "rapida", delivery_note_series: "T001", delivery_note_number: String(++n),
        delivery_note_date: "2026-09-03", file_id, items: [{ product_id: productId, total_quantity: 1, locations: [{ bin_id: binId, quantity: 1 }] }] }),
};

test("cada documento puede nacer con su archivo: el detalle lo trae y el archivo queda ocupado", async () => {
    for (const [name, create] of Object.entries(creators)) {
        const fileId = await makeFile();
        const detail = await create(fileId);
        assert.equal(String(detail.file?.file_id), String(fileId), name);
        assert.match(detail.file.url, /files/, name);
    }
});

test("sin file_id (o con null) el documento se crea como siempre, sin archivo", async () => {
    for (const [name, create] of Object.entries(creators)) {
        assert.equal((await create(undefined)).file, null, name + " sin file_id");
        assert.equal((await create(null)).file, null, name + " con null");
    }
});

test("un archivo ya usado no se reutiliza en otro documento (409); uno de otro módulo no existe para Almacén (404)", async () => {
    const used = await makeFile(); await creators.factura(used);
    for (const [name, create] of Object.entries(creators)) await assert.rejects(create(used), codeOf("DOCUMENT_FILE_ALREADY_ATTACHED"), name);
    const foreign = await makeFile("metrados");
    for (const [name, create] of Object.entries(creators)) await assert.rejects(create(foreign), codeOf("DOCUMENT_FILE_NOT_FOUND"), name);
    await assert.rejects(creators.orden(999999999), codeOf("DOCUMENT_FILE_NOT_FOUND"));
});

test("todo o nada: si el documento falla (número repetido) no queda vínculo y el archivo sigue libre", async () => {
    const first = await createPurchaseRequisitionService(user, ctx(), { number: "REQ-DUP", requisition_date: "2026-09-01", requester: "Obra", items: [{ product_id: productId, description: "x", quantity_requested: 1 }] });
    const free = await makeFile();
    await assert.rejects(createPurchaseRequisitionService(user, ctx(), { number: "REQ-DUP", requisition_date: "2026-09-01", requester: "Obra", file_id: free,
        items: [{ product_id: productId, description: "x", quantity_requested: 1 }] }), codeOf("PURCHASE_REQUISITION_DUPLICATE_NUMBER"));
    assert.equal((await q(`SELECT COUNT(*)::int AS n FROM purchase_requisitions WHERE file_id = $1`, [free]))[0].n, 0, "el archivo no quedó vinculado");
    const again = await creators.orden(free);
    assert.equal(String(again.file.file_id), String(free), "y se puede usar en otro documento");
    assert.ok(first);
});

test("Zod: file_id es opcional, admite null y solo acepta ids positivos", () => {
    const base = { supplier_id: 1, series: "F001", number: "1", invoice_date: "2026-09-01", currency: "PEN", items: [{ product_id: 1, description: "x", quantity_invoiced: 1, line_total: 1 }] };
    for (const ok of [undefined, null, 5, "5"]) assert.equal(CreateInvoiceBodySchema.safeParse({ ...base, file_id: ok }).success, true, String(ok));
    for (const bad of [0, -1, "x", 1.5]) assert.equal(CreateInvoiceBodySchema.safeParse({ ...base, file_id: bad }).success, false, String(bad));
    const receipt = { supplier_id: 1, entry_type: "rapida", delivery_note_series: "T001", delivery_note_number: "1", delivery_note_date: "2026-09-01",
        items: [{ product_id: 1, total_quantity: 1, locations: [{ bin_id: 1, quantity: 1 }] }] };
    assert.equal(CreateGoodsReceiptBodySchema.safeParse({ ...receipt, file_id: 3 }).success, true);
    assert.equal(CreateGoodsReceiptBodySchema.safeParse({ ...receipt, file_id: "abc" }).success, false);
});
