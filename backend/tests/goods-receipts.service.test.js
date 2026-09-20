// goods-receipts.service.test.js
//
// Test de integración (BD real) de la Fase 7 de
// docs/almacen-ingreso-productos/05-roadmap.md: el ingreso (guía + ubicación) ahora
// distingue entrada normal/rápida, cita opcionalmente una orden de compra (si lo
// hace, cada línea cita la línea de la orden), no se registra dos veces la misma
// guía, admite correcciones administrativas acotadas y archivo. Sobre todo:
// SIGUE sumando stock, casillas y Kardex exactamente igual. Corre contra dist/ ya
// compilado, sin mocks del driver.
//
// Los tests son un FLUJO en orden: comparten el proyecto, los usuarios y los
// requerimientos de prueba.
//
// Correr: npm test   (desde backend/)
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Carpeta temporal ANTES de cargar dist/ (imports dinámicos): no ensuciar uploads/.
const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "requisitions-test-"));
process.env.UPLOADS_DIR = TMP_DIR;

const { default: pool } = await import("../dist/db/database.js");
const { createFixedCategoriesForProject } = await import("../dist/services/almacen/category.service.js");
const { emptyAlmacenContentService } = await import("../dist/services/almacen/almacen-content.service.js");
const rsvc = await import("../dist/services/almacen/purchase-requisition.service.js");
const qsvc = await import("../dist/services/almacen/quotation.service.js");
const ssvc = await import("../dist/services/almacen/supplier.service.js");
const { deleteFileService } = await import("../dist/services/files.service.js");
const schemas = await import("../dist/schemas/almacen/goods-receipt.schema.js");
const psvc = await import("../dist/services/almacen/purchase-order.service.js");
const rcsvc = await import("../dist/services/almacen/goods-receipt.service.js");
const kdxsvc = await import("../dist/services/almacen/inventory-movement.service.js");

const OWNER_USER_ID = 1;
const asUser = (userId) => ({ user_id: userId, role_id: 4, email: "test@example.test" });
const codeOf = (expected) => (error) => error?.response?.code === expected;

let projectId;
let otherProjectId;
let editorId;   // Editor de Almacén: view/upload/process/delete, SIN configure
let plainId;    // miembro sin rol: solo "ver"
let outsiderId; // no es miembro
let productId;
let otherProductId; // de otro proyecto
let productY, binA, binB; // segundo producto y dos casillas
let supplierA, supplierB, otherSupplier; // proveedores (los dos primeros de este proyecto)
const state = {};

const q = async (sql, params) => (await pool.query(sql, params)).rows;
const createUser = async (label) => (await q(
    `INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, 'x', 4) RETURNING user_id`,
    [`[test] ${label}`, `test-${label}-${randomUUID()}@example.test`]
))[0].user_id;

// Archivo real en disco + su fila en `files` (como lo deja una subida).
const makeFile = async (project, moduleCode = "almacen") => {
    const filePath = path.join(TMP_DIR, `${randomUUID()}.pdf`);
    fs.writeFileSync(filePath, "%PDF-test");
    const [row] = await q(
        `INSERT INTO files (project_id, module_id, file_type, name, file_path, file_size, mime_type, uploaded_by)
        VALUES ($1, (SELECT module_id FROM modules WHERE code = $2), 'pdf', 'req.pdf', $3, 9, 'application/pdf', $4)
        RETURNING file_id`, [project, moduleCode, filePath, OWNER_USER_ID]
    );
    return { fileId: row.file_id, filePath };
};
const fileRowExists = async (fileId) => (await q(`SELECT 1 FROM files WHERE file_id = $1`, [fileId])).length === 1;

before(async () => {
    const mkProject = async (name) => Number((await q(
        `INSERT INTO projects (name, owner_id, created_by) VALUES ($1, $2, $2) RETURNING project_id`, [name, OWNER_USER_ID]
    ))[0].project_id);
    projectId = await mkProject("[test] requisitions");
    otherProjectId = await mkProject("[test] requisitions (otro proyecto)");

    for (const id of [projectId, otherProjectId]) {
        const client = await pool.connect();
        try { await createFixedCategoriesForProject(client, id, OWNER_USER_ID); } finally { client.release(); }
    }

    editorId = await createUser("editor");
    plainId = await createUser("plain");
    outsiderId = await createUser("outsider");
    const memberIds = {};
    for (const userId of [editorId, plainId]) {
        memberIds[userId] = (await q(
            `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) RETURNING project_member_id`, [projectId, userId]
        ))[0].project_member_id;
    }
    await pool.query(
        `INSERT INTO project_member_module_roles (project_member_id, module_id, module_role_id)
        SELECT $1, m.module_id, mr.module_role_id
        FROM modules m INNER JOIN module_roles mr ON mr.module_id = m.module_id
        WHERE m.code = 'almacen' AND mr.name = 'Editor'`,
        [memberIds[editorId]]
    );

    const mkProduct = async (project, code) => {
        const [{ category_id: categoryId }] = await q(`SELECT category_id FROM categories WHERE project_id = $1 AND name = 'Partida'`, [project]);
        return (await q(
            `INSERT INTO products (project_id, category_id, code, is_fixed, display_id, name, unit, created_by)
            VALUES ($1, $2, $3, true, 1, '[test] producto', 'und', $4) RETURNING product_id`, [project, categoryId, code, OWNER_USER_ID]
        ))[0].product_id;
    };
    productId = await mkProduct(projectId, "T-1");
    otherProductId = await mkProduct(otherProjectId, "T-1");
    const [{ warehouse_style_id: styleId }] = await q(`SELECT warehouse_style_id FROM warehouse_styles LIMIT 1`);
    const [{ warehouse_id: warehouseId }] = await q(
        `INSERT INTO warehouses (project_id, warehouse_style_id, name, corner1_x, corner1_z, corner2_x, corner2_z, direction, area_m2, grid_width, grid_depth, created_by)
        VALUES ($1, $2, '[test] almacén', 0, 0, 10, 10, 'norte', 100, 5, 5, $3) RETURNING warehouse_id`, [projectId, styleId, OWNER_USER_ID]);
    const [{ rack_id: rackId }] = await q(
        `INSERT INTO racks (warehouse_id, name, corner1_x, corner1_z, corner2_x, corner2_z, levels, direction, created_by)
        VALUES ($1, '[test] estante', 0, 0, 1.3, 1.3, 2, 0, $2) RETURNING rack_id`, [warehouseId, OWNER_USER_ID]);
    binA = (await q(`INSERT INTO bins (rack_id, bay, level, face, location_label, name) VALUES ($1, 0, 0, 0, 'A1', 'A1') RETURNING bin_id`, [rackId]))[0].bin_id;
    binB = (await q(`INSERT INTO bins (rack_id, bay, level, face, location_label, name) VALUES ($1, 0, 1, 0, 'A2', 'A2') RETURNING bin_id`, [rackId]))[0].bin_id;
    productY = await mkProduct(projectId, "T-2");
    const owner = asUser(OWNER_USER_ID);
    supplierA = (await ssvc.createSupplierService(owner, { projectId }, { ruc: "20123456789", name: "Cementos del Sur SAC" })).supplier_id;
    supplierB = (await ssvc.createSupplierService(owner, { projectId }, { ruc: "20987654321", name: "Ferretería Norte SAC" })).supplier_id;
    otherSupplier = (await ssvc.createSupplierService(owner, { projectId: otherProjectId }, { ruc: "20555555555", name: "Proveedor de otro proyecto" })).supplier_id;
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
        fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
});

const owner = () => asUser(OWNER_USER_ID);
const rparams = (id, extra = {}) => ({ projectId, goodsReceiptId: id, ...extra });
const oparams = (id, extra = {}) => ({ projectId, purchaseOrderId: id, ...extra });
const stockOf = async (product) => Number((await q(`SELECT COALESCE(SUM(quantity),0) AS t FROM bin_contents WHERE product_id = $1`, [product]))[0].t);
const binStock = async (bin, product) => Number((await q(`SELECT COALESCE(SUM(quantity),0) AS t FROM bin_contents WHERE bin_id = $1 AND product_id = $2`, [bin, product]))[0].t);
const movementsOf = async (product) => (await q(`SELECT type, quantity::float AS quantity, resulting_balance::float AS balance, reference_document_type FROM inventory_movements WHERE product_id = $1 ORDER BY inventory_movement_id`, [product]));
const directPo = (supplier, number, lines) => psvc.createPurchaseOrderService(owner(), { projectId }, {
    supplier_id: supplier, number, order_date: "2026-09-15", currency: "PEN",
    items: lines.map(([product, qty, total]) => ({ product_id: product, description: "Según orden", quantity_ordered: qty, line_total: total })),
});
// Ingreso rápido por defecto (sin documentos previos).
const rapid = (over = {}) => ({
    supplier_id: supplierA, entry_type: "rapida", delivery_note_series: "T001", delivery_note_number: "1", delivery_note_date: "2026-09-10", received_date: "2026-09-12",
    items: [{ product_id: productId, total_quantity: 97, quantity_per_delivery_note: 100, locations: [{ bin_id: binA, quantity: 60 }, { bin_id: binB, quantity: 37 }] }], ...over,
});
const withOrder = (over = {}) => ({
    supplier_id: supplierA, entry_type: "normal", purchase_order_id: state.poA?.purchase_order_id, delivery_note_series: "T001", delivery_note_number: "10",
    delivery_note_date: "2026-09-10", received_date: "2026-09-12",
    items: [{ purchase_order_item_id: state.poA?.items[0].purchase_order_item_id, total_quantity: 40, quantity_per_delivery_note: 40, locations: [{ bin_id: binA, quantity: 40 }] }], ...over,
});

test("Zod: entry_type obligatorio, entrada rápida sin orden, producto opcional si cita, PATCH solo datos de la guía", () => {
    const { CreateGoodsReceiptBodySchema: Create, UpdateGoodsReceiptBodySchema: Patch, LinkGoodsReceiptPurchaseOrderBodySchema: Link,
        SetGoodsReceiptFileBodySchema: SetFile, ListGoodsReceiptsQuerySchema: List } = schemas;
    const ok = { supplier_id: 1, entry_type: "rapida", delivery_note_series: "t001", delivery_note_number: "123", delivery_note_date: "2026-09-10",
        items: [{ product_id: 1, total_quantity: 10, locations: [{ bin_id: 1, quantity: 10 }] }] };
    assert.equal(Create.safeParse(ok).success, true);
    assert.equal(Create.parse(ok).delivery_note_series, "T001", "la serie se pasa a mayúsculas");
    for (const bad of [undefined, "urgente", "RAPIDA", ""]) assert.equal(Create.safeParse({ ...ok, entry_type: bad }).success, false, `entry_type ${String(bad)}`);
    assert.equal(Create.safeParse({ ...ok, purchase_order_id: 5 }).success, false, "una entrada rápida no cita orden");
    assert.equal(Create.safeParse({ ...ok, entry_type: "normal", purchase_order_id: 5 }).success, true);
    assert.equal(Create.safeParse({ ...ok, entry_type: "normal" }).success, true, "normal con orden pendiente");
    const citing = { ...ok, entry_type: "normal", purchase_order_id: 5, items: [{ purchase_order_item_id: 9, total_quantity: 10, locations: [{ bin_id: 1, quantity: 10 }] }] };
    assert.equal(Create.safeParse(citing).success, true, "sin product_id si cita una línea de orden");
    assert.equal(Create.safeParse({ ...ok, items: [{ product_id: 1, total_quantity: 10, locations: [{ bin_id: 1, quantity: 9 }] }] }).success, false, "la suma por casilla debe dar el total");
    assert.equal(Patch.safeParse({}).success, false);
    assert.equal(Patch.safeParse({ delivery_note_number: "5" }).success, true);
    assert.equal(Patch.safeParse({ received_date: "2026-09-01" }).success, false, "la fecha física de recepción no se corrige por PATCH");
    assert.equal(Patch.safeParse({ items: [] }).success, false, "las cantidades no se editan");
    assert.equal(Patch.safeParse({ delivery_note_series: "GR-1" }).success, false);
    assert.equal(Link.safeParse({ purchase_order_id: 1, items: [{ goods_receipt_item_id: 1, purchase_order_item_id: 2 }] }).success, true);
    assert.equal(Link.safeParse({ purchase_order_id: 1, items: [{ goods_receipt_item_id: 1, purchase_order_item_id: 2 }, { goods_receipt_item_id: 1, purchase_order_item_id: 3 }] }).success, false, "línea repetida");
    assert.equal(Link.safeParse({ purchase_order_id: 1, items: [] }).success, false);
    assert.equal(SetFile.safeParse({}).success, false);
    assert.equal(List.safeParse({ entry_type: "otra" }).success, false);
});

test("preparar: dos órdenes de compra de proveedores distintos", async () => {
    state.poA = await directPo(supplierA, "OC-A", [[productId, 100, 3000], [productY, 50, 1000]]);
    state.poB = await directPo(supplierB, "OC-B", [[productId, 10, 300]]);
    assert.equal(state.poA.items.length, 2);
});

test("el ingreso SIGUE sumando stock por casilla y dejando su Kardex (entrada rápida, sin documentos previos)", async () => {
    assert.equal(await stockOf(productId), 0);
    const r = await rcsvc.createGoodsReceiptService(owner(), { projectId }, rapid());
    state.rc1 = r;
    assert.equal(r.entry_type, "rapida");
    assert.equal(r.purchase_order, null);
    assert.equal(r.received_date, "2026-09-12");
    assert.equal(r.file, null);
    assert.equal(r.has_file, false);
    assert.equal(r.items.length, 1);
    assert.equal(r.items[0].purchase_order_item, null);
    assert.equal(String(r.items[0].total_quantity), "97.000000", "lo recibido");
    assert.equal(String(r.items[0].quantity_per_delivery_note), "100.000000", "lo que decía la guía");
    assert.equal(r.items[0].locations.length, 2);
    assert.equal(await binStock(binA, productId), 60);
    assert.equal(await binStock(binB, productId), 37);
    assert.equal(await stockOf(productId), 97);
    const kardex = await movementsOf(productId);
    assert.deepEqual(kardex, [
        { type: "entrada", quantity: 60, balance: 60, reference_document_type: "goods_receipt" },
        { type: "entrada", quantity: 37, balance: 97, reference_document_type: "goods_receipt" }]);
    const listed = await kdxsvc.listInventoryMovementsService(owner(), { projectId }, { product_id: productId });
    assert.ok(listed.every((m) => m.movement_date === "2026-09-12"), "el Kardex usa la fecha del ingreso");
});

test("entrada normal con orden: solo algunas líneas, recibiendo distinto a lo ordenado; el producto sale de la línea de la orden y el stock suma", async () => {
    const r = await rcsvc.createGoodsReceiptService(owner(), { projectId }, withOrder());
    state.rc2 = r;
    assert.equal(r.entry_type, "normal");
    assert.equal(r.purchase_order.number, "OC-A");
    assert.equal(r.items.length, 1, "solo una de las 2 líneas de la orden");
    const line = r.items[0];
    assert.equal(String(line.product_id), String(productId), "producto deducido de la línea de la orden");
    assert.equal(line.purchase_order_item.quantity_ordered, "100.000000", "lo que decía la orden (se recibieron 40)");
    assert.equal(await stockOf(productId), 137);
    assert.equal(await binStock(binA, productId), 100);
    assert.equal((await movementsOf(productId)).length, 3);
});

test("recepciones parciales: la misma línea de orden en varios ingresos; ingreso normal sin orden (pendiente); otro proveedor", async () => {
    const second = await rcsvc.createGoodsReceiptService(owner(), { projectId }, withOrder({ delivery_note_number: "11", items: [
        { purchase_order_item_id: state.poA.items[0].purchase_order_item_id, total_quantity: 30, locations: [{ bin_id: binB, quantity: 30 }] } ] }));
    state.rc3 = second;
    const pending = await rcsvc.createGoodsReceiptService(owner(), { projectId }, rapid({
        entry_type: "normal", delivery_note_number: "12", items: [{ product_id: productY, total_quantity: 20, locations: [{ bin_id: binA, quantity: 20 }] }] }));
    state.rc4 = pending;
    assert.equal(pending.entry_type, "normal");
    assert.equal(pending.purchase_order, null, "normal con la orden pendiente de vincular");
    const fromB = await rcsvc.createGoodsReceiptService(owner(), { projectId }, withOrder({
        supplier_id: supplierB, purchase_order_id: state.poB.purchase_order_id, delivery_note_number: "10", items: [
        { purchase_order_item_id: state.poB.items[0].purchase_order_item_id, total_quantity: 10, locations: [{ bin_id: binB, quantity: 10 }] } ] }));
    state.rc5 = fromB;
    assert.equal(await stockOf(productId), 177);
    const byOrder = await rcsvc.listGoodsReceiptsService(asUser(plainId), { projectId }, { purchase_order_id: state.poA.purchase_order_id });
    assert.equal(byOrder.length, 2, "2 ingresos de la misma orden");
});

test("crear: reglas de tipo de entrada, proveedor, orden, vínculos y producto; un fallo no deja stock ni filas a medias", async () => {
    const [{ n: before }] = await q(`SELECT COUNT(*)::int AS n FROM goods_receipts WHERE project_id = $1`, [projectId]);
    const stockBefore = await stockOf(productId);
    const movBefore = (await movementsOf(productId)).length;
    const line = (over = {}) => ({ purchase_order_item_id: state.poA.items[0].purchase_order_item_id, total_quantity: 1, locations: [{ bin_id: binA, quantity: 1 }], ...over });
    const mk = (over) => withOrder({ delivery_note_number: "77", items: [line()], ...over });
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, mk({ entry_type: "rapida" })), codeOf("GOODS_RECEIPT_ENTRY_TYPE_MISMATCH"));
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, mk({ supplier_id: supplierB })), codeOf("GOODS_RECEIPT_SUPPLIER_MISMATCH"));
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, mk({ purchase_order_id: 999999999 })), codeOf("PURCHASE_ORDER_NOT_FOUND"));
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, mk({ supplier_id: otherSupplier, purchase_order_id: null, items: [{ product_id: productId, total_quantity: 1, locations: [{ bin_id: binA, quantity: 1 }] }] })), codeOf("SUPPLIER_NOT_FOUND"));
    // Trazabilidad de línea: con orden, una línea que no cita nada se rechaza.
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, mk({ items: [line(), { product_id: productId, total_quantity: 1, locations: [{ bin_id: binA, quantity: 1 }] }] })), codeOf("GOODS_RECEIPT_LINK_REQUIRED"));
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, mk({ items: [line({ purchase_order_item_id: state.poB.items[0].purchase_order_item_id })] })), codeOf("GOODS_RECEIPT_LINK_INVALID"), "línea de OTRA orden");
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, mk({ items: [line({ product_id: productY })] })), codeOf("GOODS_RECEIPT_PRODUCT_MISMATCH"));
    // Sin orden: no se citan líneas y el producto es obligatorio.
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, rapid({ delivery_note_number: "78", items: [line()] })), codeOf("GOODS_RECEIPT_LINK_INVALID"));
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, rapid({ delivery_note_number: "79", items: [{ total_quantity: 1, locations: [{ bin_id: binA, quantity: 1 }] }] })), codeOf("GOODS_RECEIPT_PRODUCT_REQUIRED"));
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, rapid({ delivery_note_number: "80", items: [{ product_id: otherProductId, total_quantity: 1, locations: [{ bin_id: binA, quantity: 1 }] }] })), codeOf("PRODUCT_NOT_FOUND"));
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, rapid({ delivery_note_number: "81", items: [{ product_id: productId, total_quantity: 1, locations: [{ bin_id: 999999999, quantity: 1 }] }] })), codeOf("BIN_NOT_FOUND"));
    const [{ n: after }] = await q(`SELECT COUNT(*)::int AS n FROM goods_receipts WHERE project_id = $1`, [projectId]);
    assert.equal(after, before, "los fallidos no dejaron cabecera");
    assert.equal(await stockOf(productId), stockBefore, "ni stock");
    assert.equal((await movementsOf(productId)).length, movBefore, "ni movimientos de Kardex");
});

test("la misma guía no se registra dos veces (proveedor + serie + número); otro proveedor sí; la serie va en mayúsculas en el motor", async () => {
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, rapid()), codeOf("GOODS_RECEIPT_DUPLICATE_DELIVERY_NOTE"));
    assert.equal(state.rc5.delivery_note_number, "10", "el proveedor B ya registró T001-10: permitido porque es otro proveedor");
    assert.equal(await stockOf(productId), 177, "el duplicado rechazado no sumó stock");
    await assert.rejects(rcsvc.createGoodsReceiptService(owner(), { projectId }, rapid({ delivery_note_series: "t001", delivery_note_number: "555" })), (e) => e?.code === "23514", "CHECK de mayúsculas (Zod la normaliza en la API)");
});

test("listar y filtrar por proveedor, orden, tipo de entrada y texto (serie-número o proveedor); el detalle respeta el proyecto", async () => {
    const list = (query) => rcsvc.listGoodsReceiptsService(asUser(plainId), { projectId }, query);
    assert.equal((await list({})).length, 5);
    assert.equal((await list({ supplier_id: supplierB })).length, 1);
    assert.equal((await list({ entry_type: "rapida" })).length, 1);
    assert.equal((await list({ entry_type: "normal" })).length, 4);
    assert.equal((await list({ search: "T001-10" })).length, 2, "serie-número en dos proveedores");
    assert.equal((await list({ search: "ferret" })).length, 1);
    assert.equal((await list({ search: "%" })).length, 0);
    assert.equal((await list({}))[0].has_file, false);
    await assert.rejects(rcsvc.getGoodsReceiptByIdService(owner(), { projectId: otherProjectId, goodsReceiptId: state.rc1.goods_receipt_id }), codeOf("GOODS_RECEIPT_NOT_FOUND"));
});

test("PATCH administrativo: corrige serie, número y fecha de la guía con auditoría; NO toca cantidades, casillas ni stock; el duplicado se rechaza", async () => {
    const id = state.rc1.goods_receipt_id;
    const stockBefore = await stockOf(productId);
    const a = await rcsvc.updateGoodsReceiptService(asUser(editorId), rparams(id), { delivery_note_number: "2", delivery_note_date: "2026-09-09" });
    assert.equal(a.delivery_note_number, "2");
    assert.equal(a.delivery_note_date, "2026-09-09");
    assert.equal(a.delivery_note_series, "T001", "lo no enviado no se toca");
    assert.equal(a.updated_by, editorId);
    assert.ok(a.updated_at);
    assert.equal(a.received_date, "2026-09-12", "la fecha física no cambia");
    assert.equal(String(a.items[0].total_quantity), "97.000000");
    assert.equal(await stockOf(productId), stockBefore, "el stock no cambia");
    // ("T001-10" del proveedor A ya existe en la entrada normal con orden)
    await assert.rejects(rcsvc.updateGoodsReceiptService(asUser(editorId), rparams(id), { delivery_note_number: "10" }), codeOf("GOODS_RECEIPT_DUPLICATE_DELIVERY_NOTE"));
    await assert.rejects(rcsvc.updateGoodsReceiptService(asUser(editorId), rparams(999999999), { delivery_note_number: "9" }), codeOf("GOODS_RECEIPT_NOT_FOUND"));
    await rcsvc.updateGoodsReceiptService(asUser(editorId), rparams(id), { delivery_note_number: "1", delivery_note_date: "2026-09-10" });
});

test("vincular la orden después: el ingreso pendiente y el rápido se enlazan línea por línea, pasan a normal y no cambia el stock", async () => {
    const stockBefore = [await stockOf(productId), await stockOf(productY)];
    const movBefore = (await movementsOf(productId)).length;
    const poItemY = state.poA.items[1].purchase_order_item_id;
    // Ingreso normal con la orden pendiente (rc4, producto Y).
    const linked = await rcsvc.linkGoodsReceiptPurchaseOrderService(asUser(editorId), rparams(state.rc4.goods_receipt_id), {
        purchase_order_id: state.poA.purchase_order_id, items: [{ goods_receipt_item_id: state.rc4.items[0].goods_receipt_item_id, purchase_order_item_id: poItemY }] });
    assert.equal(linked.entry_type, "normal");
    assert.equal(linked.purchase_order.number, "OC-A");
    assert.equal(String(linked.items[0].purchase_order_item.purchase_order_item_id), String(poItemY));
    assert.equal(linked.updated_by, editorId);

    // Ingreso rápido (rc1, producto X): al vincularlo pasa a normal.
    const rapidLinked = await rcsvc.linkGoodsReceiptPurchaseOrderService(asUser(editorId), rparams(state.rc1.goods_receipt_id), {
        purchase_order_id: state.poA.purchase_order_id, items: [{ goods_receipt_item_id: state.rc1.items[0].goods_receipt_item_id, purchase_order_item_id: state.poA.items[0].purchase_order_item_id }] });
    assert.equal(rapidLinked.entry_type, "normal", "una entrada rápida vinculada pasa a normal");
    assert.deepEqual([await stockOf(productId), await stockOf(productY)], stockBefore, "vincular no toca el stock");
    assert.equal((await movementsOf(productId)).length, movBefore, "ni el Kardex");
});

test("vincular: hay que indicar TODAS las líneas, con el mismo producto, del proveedor y del proyecto", async () => {
    const id = state.rc5.goods_receipt_id; // proveedor B, línea de X
    const item = state.rc5.items[0].goods_receipt_item_id;
    const body = (over) => ({ purchase_order_id: state.poB.purchase_order_id, items: [{ goods_receipt_item_id: item, purchase_order_item_id: state.poB.items[0].purchase_order_item_id }], ...over });
    await assert.rejects(rcsvc.linkGoodsReceiptPurchaseOrderService(asUser(editorId), rparams(id), body({ items: [{ goods_receipt_item_id: 999999999, purchase_order_item_id: state.poB.items[0].purchase_order_item_id }] })), codeOf("GOODS_RECEIPT_LINK_ITEMS_MISMATCH"), "línea del ingreso inexistente");
    await assert.rejects(rcsvc.linkGoodsReceiptPurchaseOrderService(asUser(editorId), rparams(id), body({ purchase_order_id: state.poA.purchase_order_id })), codeOf("GOODS_RECEIPT_SUPPLIER_MISMATCH"));
    await assert.rejects(rcsvc.linkGoodsReceiptPurchaseOrderService(asUser(editorId), rparams(id), body({ items: [{ goods_receipt_item_id: item, purchase_order_item_id: state.poA.items[0].purchase_order_item_id }] })), codeOf("GOODS_RECEIPT_LINK_INVALID"), "línea de otra orden");
    await assert.rejects(rcsvc.linkGoodsReceiptPurchaseOrderService(asUser(editorId), rparams(id), body({ purchase_order_id: 999999999 })), codeOf("PURCHASE_ORDER_NOT_FOUND"));
    // Producto distinto: la orden C (mismo proveedor B) tiene una línea de Y; el ingreso recibió X.
    const poC = await directPo(supplierB, "OC-C", [[productY, 5, 50]]);
    await assert.rejects(rcsvc.linkGoodsReceiptPurchaseOrderService(asUser(editorId), rparams(id), { purchase_order_id: poC.purchase_order_id, items: [{ goods_receipt_item_id: item, purchase_order_item_id: poC.items[0].purchase_order_item_id }] }), codeOf("GOODS_RECEIPT_PRODUCT_MISMATCH"));
    // Un ingreso con dos líneas: si se omite una, se rechaza y no queda nada a medias.
    const two = await rcsvc.createGoodsReceiptService(owner(), { projectId }, rapid({ supplier_id: supplierB, delivery_note_number: "40", items: [
        { product_id: productId, total_quantity: 1, locations: [{ bin_id: binA, quantity: 1 }] }, { product_id: productY, total_quantity: 1, locations: [{ bin_id: binA, quantity: 1 }] }] }));
    const poD = await directPo(supplierB, "OC-D", [[productId, 1, 10], [productY, 1, 10]]);
    await assert.rejects(rcsvc.linkGoodsReceiptPurchaseOrderService(asUser(editorId), rparams(two.goods_receipt_id), { purchase_order_id: poD.purchase_order_id, items: [
        { goods_receipt_item_id: two.items[0].goods_receipt_item_id, purchase_order_item_id: poD.items[0].purchase_order_item_id }] }), codeOf("GOODS_RECEIPT_LINK_ITEMS_MISMATCH"));
    const still = await rcsvc.getGoodsReceiptByIdService(owner(), rparams(two.goods_receipt_id));
    assert.equal(still.purchase_order, null);
    assert.equal(still.entry_type, "rapida");
    assert.ok(still.items.every((i) => i.purchase_order_item === null));
    state.leftoverOrders = [poC, poD];
});

test("candados sobre la orden: una línea con ingresos no cambia cantidad ni montos ni se quita; la orden con ingresos no se da de baja", async () => {
    const oid = state.poA.purchase_order_id;
    const line0 = state.poA.items[0].purchase_order_item_id;
    // Descripción y observaciones: libres.
    await psvc.updatePurchaseOrderItemService(asUser(editorId), oparams(oid, { itemId: line0 }), { description: "Texto corregido en la orden" });
    for (const field of [{ quantity_ordered: 5 }, { unit_price: 1 }, { discount_amount: 1 }, { tax_amount: 1 }, { line_total: 1 }]) {
        await assert.rejects(psvc.updatePurchaseOrderItemService(asUser(editorId), oparams(oid, { itemId: line0 }), field), codeOf("PURCHASE_ORDER_ITEM_LOCKED"), JSON.stringify(field));
    }
    await assert.rejects(psvc.deletePurchaseOrderItemService(asUser(editorId), oparams(oid, { itemId: line0 })), codeOf("PURCHASE_ORDER_ITEM_LOCKED"));
    await assert.rejects(psvc.deletePurchaseOrderService(owner(), oparams(oid)), codeOf("PURCHASE_ORDER_HAS_DOCUMENTS"));
    // OC-B también tiene un ingreso (rc5): tampoco se da de baja.
    await assert.rejects(psvc.deletePurchaseOrderService(owner(), oparams(state.poB.purchase_order_id)), codeOf("PURCHASE_ORDER_HAS_DOCUMENTS"));
});

test("archivo de la guía: adjuntar, reemplazar y quitar elimina el anterior; no compartir con otro documento; DELETE /files se rechaza", async () => {
    const id = state.rc1.goods_receipt_id;
    const f1 = await makeFile(projectId);
    const withFile = await rcsvc.setGoodsReceiptFileService(asUser(editorId), rparams(id), { file_id: f1.fileId });
    assert.equal(withFile.file.file_id, f1.fileId);
    assert.equal(withFile.has_file, true);
    assert.match(withFile.file.url, /^\/files\/\d+\/content\?token=/);
    await assert.rejects(deleteFileService(owner(), { projectId, fileId: f1.fileId }), codeOf("FILE_IN_USE"));

    // El archivo de una orden no se adjunta a un ingreso, ni al revés.
    const oFile = await makeFile(projectId);
    await psvc.setPurchaseOrderFileService(asUser(editorId), oparams(state.poB.purchase_order_id), { file_id: oFile.fileId });
    await assert.rejects(rcsvc.setGoodsReceiptFileService(asUser(editorId), rparams(state.rc2.goods_receipt_id), { file_id: oFile.fileId }), codeOf("DOCUMENT_FILE_ALREADY_ATTACHED"));
    await assert.rejects(psvc.setPurchaseOrderFileService(asUser(editorId), oparams(state.poA.purchase_order_id), { file_id: f1.fileId }), codeOf("DOCUMENT_FILE_ALREADY_ATTACHED"));
    for (const f of [await makeFile(otherProjectId), await makeFile(projectId, "metrados")]) {
        state.leftovers = [...(state.leftovers ?? []), f.fileId];
        await assert.rejects(rcsvc.setGoodsReceiptFileService(asUser(editorId), rparams(id), { file_id: f.fileId }), codeOf("DOCUMENT_FILE_NOT_FOUND"));
    }
    const f2 = await makeFile(projectId);
    await rcsvc.setGoodsReceiptFileService(asUser(editorId), rparams(id), { file_id: f2.fileId });
    assert.equal(await fileRowExists(f1.fileId), false);
    assert.equal(fs.existsSync(f1.filePath), false, "los bytes anteriores se eliminaron");
    assert.equal((await rcsvc.listGoodsReceiptsService(asUser(plainId), { projectId }, { search: "T001-1" })).some((r) => r.has_file), true);
    await rcsvc.setGoodsReceiptFileService(asUser(editorId), rparams(id), { file_id: null });
    assert.equal(await fileRowExists(f2.fileId), false, "quitar el archivo lo elimina");
    assert.equal(fs.existsSync(f2.filePath), false);
    const f3 = await makeFile(projectId);
    await rcsvc.setGoodsReceiptFileService(asUser(editorId), rparams(id), { file_id: f3.fileId });
    state.f3 = f3;
});

test("permisos: solo ver lee pero no escribe; ajeno al proyecto no ve nada; los ingresos no se dan de baja (no existe esa operación)", async () => {
    const id = state.rc1.goods_receipt_id;
    assert.equal((await rcsvc.getGoodsReceiptByIdService(asUser(plainId), rparams(id))).delivery_note_number, "1");
    await assert.rejects(rcsvc.createGoodsReceiptService(asUser(plainId), { projectId }, rapid({ delivery_note_number: "P1" })), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(rcsvc.updateGoodsReceiptService(asUser(plainId), rparams(id), { delivery_note_number: "5" }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(rcsvc.setGoodsReceiptFileService(asUser(plainId), rparams(id), { file_id: null }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(rcsvc.linkGoodsReceiptPurchaseOrderService(asUser(plainId), rparams(id), { purchase_order_id: 1, items: [{ goods_receipt_item_id: 1, purchase_order_item_id: 1 }] }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(rcsvc.listGoodsReceiptsService(asUser(outsiderId), { projectId }, {}), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    assert.equal(rcsvc.deleteGoodsReceiptService, undefined, "no hay servicio de baja de ingresos");
});

test("vaciar Almacén: elimina ingresos (antes que las órdenes que citan), su archivo, órdenes y proveedores", async () => {
    const counts = await emptyAlmacenContentService(owner(), { projectId });
    assert.ok(counts.goods_receipts >= 6);
    assert.ok(counts.purchase_orders >= 4);
    assert.equal(await fileRowExists(state.f3.fileId), false, "el archivo de la guía se elimina");
    assert.equal(fs.existsSync(state.f3.filePath), false);
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM goods_receipt_items WHERE goods_receipt_id IN (SELECT goods_receipt_id FROM goods_receipts WHERE project_id = $1)`, [projectId]);
    assert.equal(n, 0);
    await pool.query(`DELETE FROM files WHERE file_id = ANY($1::bigint[])`, [state.leftovers ?? []]);
});
