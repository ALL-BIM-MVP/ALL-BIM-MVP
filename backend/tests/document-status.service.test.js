// document-status.service.test.js
//
// Test de integración (BD real) de la Fase 8 de
// docs/almacen-ingreso-productos/05-roadmap.md: estado documental DERIVADO. Avance por
// línea (pedido / ordenado / facturado / recibido / pendiente), adjudicación de
// cotizaciones, "expediente" del ingreso y avisos. Todo se calcula al consultar y
// nunca bloquea. Caso central del roadmap: orden de 100, recibidas 60 + 40 y una
// factura pendiente. Corre contra dist/ ya compilado, sin mocks del driver.
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
const isvc = await import("../dist/services/almacen/invoice.service.js");
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
const ctx = () => ({ projectId });
const codes = (alerts) => alerts.map((a) => a.code).sort();
const sumSql = async (sql, params) => Number((await q(sql, params))[0].t ?? 0);

const setup = {};
const mkOrder = (supplier, number, origin, lines) => psvc.createPurchaseOrderService(owner(), ctx(), {
    supplier_id: supplier, number, order_date: "2026-09-15", currency: "PEN", ...origin,
    items: lines.map(([link, qty, total]) => ({ ...link, description: "Según orden", quantity_ordered: qty, line_total: total })),
});
const receive = (supplier, number, order, lines, over = {}) => rcsvc.createGoodsReceiptService(owner(), ctx(), {
    supplier_id: supplier, entry_type: "normal", purchase_order_id: order.purchase_order_id, delivery_note_series: "T001", delivery_note_number: number,
    delivery_note_date: "2026-09-20", received_date: "2026-09-21",
    items: lines.map(([poItem, qty]) => ({ purchase_order_item_id: poItem, total_quantity: qty, locations: [{ bin_id: binA, quantity: qty }] })), ...over,
});
const invoice = (supplier, number, order, lines, over = {}) => isvc.createInvoiceService(owner(), ctx(), {
    supplier_id: supplier, purchase_order_id: order.purchase_order_id, series: "F001", number, invoice_date: "2026-09-22", currency: "PEN",
    items: lines.map(([poItem, qty]) => ({ purchase_order_item_id: poItem, description: "Según factura", quantity_invoiced: qty, line_total: qty * 10 })), ...over,
});
const reqDetail = () => rsvc.getPurchaseRequisitionByIdService(owner(), { projectId, purchaseRequisitionId: setup.req.purchase_requisition_id });
const poDetail = (po) => psvc.getPurchaseOrderByIdService(owner(), { projectId, purchaseOrderId: po.purchase_order_id });
const rcDetail = (rc) => rcsvc.getGoodsReceiptByIdService(owner(), { projectId, goodsReceiptId: rc.goods_receipt_id });

test("preparar: requerimiento de 3 líneas (100 X, 50 Y, 30 X), dos cotizaciones y una orden adjudicada", async () => {
    setup.req = await rsvc.createPurchaseRequisitionService(owner(), ctx(), {
        number: "REQ-001", requisition_date: "2026-09-10", requester: "Almacenero",
        items: [
            { product_id: productId, description: "Cemento", quantity_requested: 100 },
            { product_id: productY, description: "Fierro", quantity_requested: 50 },
            { product_id: productId, description: "Cemento para losa", quantity_requested: 30 },
        ],
    });
    setup.ri = setup.req.items.map((i) => i.purchase_requisition_item_id);
    const rid = setup.req.purchase_requisition_id;
    const qbody = (supplier, number, lines) => ({ supplier_id: supplier, purchase_requisition_id: rid, number, quotation_date: "2026-09-12", currency: "PEN",
        items: lines.map(([ri, qty]) => ({ purchase_requisition_item_id: ri, description: "Según cotización", quantity_quoted: qty, line_total: qty * 10 })) });
    setup.qA = await qsvc.createQuotationService(owner(), ctx(), qbody(supplierA, "COT-A", [[setup.ri[0], 100], [setup.ri[1], 50]]));
    setup.qB = await qsvc.createQuotationService(owner(), ctx(), qbody(supplierB, "COT-B", [[setup.ri[0], 100]]));
    // Orden A desde la cotización A: L1 100 (= cotizado) y L2 60 (cotizado 50).
    setup.poA = await mkOrder(supplierA, "OC-A", { quotation_id: setup.qA.quotation_id }, [
        [{ quotation_item_id: setup.qA.items[0].quotation_item_id }, 100, 3000], [{ quotation_item_id: setup.qA.items[1].quotation_item_id }, 60, 600]]);
    assert.equal(setup.poA.items.length, 2);
    setup.l1 = setup.poA.items[0].purchase_order_item_id;
    setup.l2 = setup.poA.items[1].purchase_order_item_id;
});

test("ANTES de recibir: la orden muestra lo ordenado y todo pendiente; el requerimiento marca en qué etapa está cada línea y cuáles faltan", async () => {
    const po = await poDetail(setup.poA);
    const [l1] = po.items;
    assert.deepEqual(l1.progress, { ordered: "100.000000", invoiced: "0.000000", received: "0.000000", pending_to_invoice: "100.000000", pending_to_receive: "100.000000", quoted: "100.000000", requested: "100.000000" });
    assert.deepEqual(l1.alerts, [], "sin recibir ni facturar no hay avisos");
    assert.deepEqual(codes(po.alerts), ["FILE_PENDING"]);

    const req = await reqDetail();
    const [r1, r2, r3] = req.items;
    assert.equal(r1.progress.offers_count, 2, "la línea 1 tiene 2 ofertas (no se suman sus cantidades)");
    assert.equal(r2.progress.offers_count, 1);
    assert.equal(r3.progress.offers_count, 0);
    assert.deepEqual(r1.progress.missing, ["invoice", "receipt"], "cotizada y ordenada; faltan factura e ingreso");
    assert.deepEqual(r3.progress.missing, ["quotation", "order", "invoice", "receipt"], "la línea 3 no aparece en ninguna etapa");
    assert.equal(r3.progress.pending_to_order, "30.000000");
    assert.deepEqual(req.summary, { lines: 3, quoted: 2, ordered: 2, invoiced: 0, received: 0, fully_received: 0 });
    assert.deepEqual(codes(req.alerts), ["FILE_PENDING"]);
});

test("CASO DEL ROADMAP: orden de 100, recibidas 60 + 40 y una factura pendiente", async () => {
    setup.rc1 = await receive(supplierA, "1", setup.poA, [[setup.l1, 60]]);
    setup.rc2 = await receive(supplierA, "2", setup.poA, [[setup.l1, 40]]);

    const po = await poDetail(setup.poA);
    const l1 = po.items[0];
    assert.equal(l1.progress.ordered, "100.000000");
    assert.equal(l1.progress.received, "100.000000", "60 + 40");
    assert.equal(l1.progress.pending_to_receive, "0.000000");
    assert.equal(l1.progress.invoiced, "0.000000");
    assert.equal(l1.progress.pending_to_invoice, "100.000000", "la factura está pendiente");
    assert.deepEqual(codes(l1.alerts), ["RECEIVED_NOT_INVOICED"]);
    assert.ok(!codes(l1.alerts).includes("OVER_RECEIVED"), "recibir lo ordenado exacto no es un exceso");

    // Expediente de cada ingreso: orden y cotización y requerimiento presentes; falta la factura y el archivo.
    for (const rc of [setup.rc1, setup.rc2]) {
        const detail = await rcDetail(rc);
        assert.deepEqual(detail.documents, { requisition: "presente", quotation: "presente", purchase_order: "presente", invoice: "pendiente", delivery_note_file: "pendiente" });
        assert.deepEqual(codes(detail.alerts), ["FILE_PENDING", "INVOICE_PENDING"]);
        assert.deepEqual(codes(detail.items[0].alerts), ["RECEIVED_NOT_INVOICED"]);
        assert.equal(detail.items[0].purchase_order_progress.received, "100.000000", "el avance de la línea de orden es ACUMULADO");
    }
    const req = await reqDetail();
    assert.equal(req.items[0].progress.received, "100.000000");
    assert.deepEqual(req.items[0].progress.missing, ["invoice"]);
    assert.equal(req.summary.received, 1);
    assert.equal(req.summary.fully_received, 1);
});

test("facturación parcial: se factura 40 de 100; después se factura de más y solo AVISA (no bloquea)", async () => {
    setup.inv1 = await invoice(supplierA, "100", setup.poA, [[setup.l1, 40]]);
    let l1 = (await poDetail(setup.poA)).items[0];
    assert.equal(l1.progress.invoiced, "40.000000");
    assert.equal(l1.progress.pending_to_invoice, "60.000000");
    assert.deepEqual(codes(l1.alerts), ["RECEIVED_NOT_INVOICED"], "sigue habiendo recibido sin facturar (100 recibidos, 40 facturados)");
    assert.equal((await rcDetail(setup.rc1)).documents.invoice, "presente", "el ingreso ya tiene una factura de su orden");
    assert.deepEqual(codes((await rcDetail(setup.rc1)).alerts), ["FILE_PENDING"]);

    // La factura muestra el avance acumulado de la línea de orden que factura.
    const invDetail = await isvc.getInvoiceByIdService(owner(), { projectId, invoiceId: setup.inv1.invoice_id });
    assert.equal(invDetail.items[0].purchase_order_progress.invoiced, "40.000000");
    assert.deepEqual(codes(invDetail.alerts), ["FILE_PENDING"]);

    // Segunda factura por 80: facturado 120 > ordenado 100 -> aviso, pero se registra igual.
    setup.inv2 = await invoice(supplierA, "101", setup.poA, [[setup.l1, 80]]);
    l1 = (await poDetail(setup.poA)).items[0];
    assert.equal(l1.progress.invoiced, "120.000000");
    assert.equal(l1.progress.pending_to_invoice, "0.000000", "el pendiente nunca es negativo");
    assert.deepEqual(codes(l1.alerts), ["INVOICED_NOT_RECEIVED", "OVER_INVOICED"], "facturado 120 > ordenado 100, y 20 facturados que aún no se recibieron; ya no hay recibido sin facturar");
    // En la factura interesa lo facturado: los mismos dos avisos.
    const inv2 = await isvc.getInvoiceByIdService(owner(), { projectId, invoiceId: setup.inv2.invoice_id });
    assert.deepEqual(codes(inv2.items[0].alerts), ["INVOICED_NOT_RECEIVED", "OVER_INVOICED"]);
    // El requerimiento: la línea 1 ya tiene factura.
    assert.equal((await reqDetail()).items[0].progress.invoiced, "120.000000");
    // En el INGRESO solo interesa lo recibido: ni el exceso facturado ni "facturado sin recibir" aparecen ahí.
    assert.deepEqual((await rcDetail(setup.rc1)).items[0].alerts, []);
});

test("recibir de más solo avisa: línea 2 pedida 50, cotizada 50, ordenada 60 y recibida 70", async () => {
    const rc = await receive(supplierA, "3", setup.poA, [[setup.l2, 70]]);
    setup.rc3 = rc;
    const po = await poDetail(setup.poA);
    const l2 = po.items[1];
    assert.equal(l2.progress.received, "70.000000");
    assert.equal(l2.progress.pending_to_receive, "0.000000");
    assert.deepEqual(codes(l2.alerts), ["ORDERED_OVER_QUOTED", "OVER_RECEIVED", "RECEIVED_NOT_INVOICED"]);
    const over = l2.alerts.find((a) => a.code === "OVER_RECEIVED");
    assert.deepEqual(over.details, { ordered: "60.000000", received: "70.000000" });
    assert.match(over.message, /recibi[óo] más de lo ordenado \(recibido 70, ordenado 60\)/i);
    assert.deepEqual(codes((await rcDetail(rc)).items[0].alerts), ["OVER_RECEIVED", "RECEIVED_NOT_INVOICED"], "en el ingreso interesa lo recibido");

    const [, r2] = (await reqDetail()).items;
    assert.equal(r2.progress.requested, "50.000000");
    assert.equal(r2.progress.ordered, "60.000000");
    assert.deepEqual(codes(r2.alerts), ["ORDERED_OVER_REQUESTED", "RECEIVED_OVER_REQUESTED"]);
});

test("cotización: la adjudicación se deduce (una línea está adjudicada si alguna orden activa la cita)", async () => {
    const qA = await qsvc.getQuotationByIdService(owner(), { projectId, quotationId: setup.qA.quotation_id });
    const [a1, a2] = qA.items;
    assert.deepEqual(a1.progress, { quoted: "100.000000", ordered: "100.000000", orders_count: 1, awarded: true, pending_to_order: "0.000000" });
    assert.equal(a2.progress.ordered, "60.000000");
    assert.deepEqual(codes(a2.alerts), ["ORDERED_OVER_QUOTED"], "ordenado 60 > cotizado 50");
    assert.deepEqual(codes(qA.alerts), ["FILE_PENDING"]);
    const qB = await qsvc.getQuotationByIdService(owner(), { projectId, quotationId: setup.qB.quotation_id });
    assert.deepEqual(qB.items[0].progress, { quoted: "100.000000", ordered: "0.000000", orders_count: 0, awarded: false, pending_to_order: "100.000000" }, "la oferta no elegida no está adjudicada");
    assert.deepEqual(qB.items[0].alerts, []);
});

test("el expediente del ingreso: entrada rápida (todo no_aplica), normal sin orden (pendiente), compra directa (sin requerimiento ni cotización) y vincular después", async () => {
    const line = (product, qty) => ({ product_id: product, total_quantity: qty, locations: [{ bin_id: binA, quantity: qty }] });
    const base = { supplier_id: supplierB, delivery_note_series: "T002", delivery_note_date: "2026-09-20", received_date: "2026-09-21" };
    // Rápida: los pasos anteriores no existen para este ingreso; solo falta el archivo.
    const fast = await rcsvc.createGoodsReceiptService(owner(), ctx(), { ...base, entry_type: "rapida", delivery_note_number: "1", items: [line(productId, 5)] });
    assert.deepEqual(fast.documents, { requisition: "no_aplica", quotation: "no_aplica", purchase_order: "no_aplica", invoice: "no_aplica", delivery_note_file: "pendiente" });
    assert.deepEqual(codes(fast.alerts), ["FILE_PENDING"]);
    // Normal sin orden: TODO pendiente ("falta registrar" no es "no hay").
    const pending = await rcsvc.createGoodsReceiptService(owner(), ctx(), { ...base, entry_type: "normal", delivery_note_number: "2", items: [line(productId, 5)] });
    assert.deepEqual(pending.documents, { requisition: "pendiente", quotation: "pendiente", purchase_order: "pendiente", invoice: "pendiente", delivery_note_file: "pendiente" });
    assert.deepEqual(codes(pending.alerts), ["FILE_PENDING", "INVOICE_PENDING", "ORDER_PENDING"]);
    assert.equal(pending.items[0].purchase_order_progress, null);
    assert.deepEqual(pending.items[0].alerts, []);
    // Compra directa (la orden no vino de un requerimiento ni de una cotización): esos pasos no aplican.
    const direct = await mkOrder(supplierB, "OC-DIRECTA", {}, [[{ product_id: productId }, 5, 50]]);
    const linked = await rcsvc.linkGoodsReceiptPurchaseOrderService(owner(), { projectId, goodsReceiptId: pending.goods_receipt_id }, {
        purchase_order_id: direct.purchase_order_id, items: [{ goods_receipt_item_id: pending.items[0].goods_receipt_item_id, purchase_order_item_id: direct.items[0].purchase_order_item_id }] });
    assert.deepEqual(linked.documents, { requisition: "no_aplica", quotation: "no_aplica", purchase_order: "presente", invoice: "pendiente", delivery_note_file: "pendiente" });
    assert.deepEqual(codes(linked.alerts), ["FILE_PENDING", "INVOICE_PENDING"], "ya no falta la orden");
    // Una entrada rápida vinculada después pasa a normal y su expediente se completa.
    const relinked = await rcsvc.linkGoodsReceiptPurchaseOrderService(owner(), { projectId, goodsReceiptId: fast.goods_receipt_id }, {
        purchase_order_id: (await mkOrder(supplierB, "OC-DIRECTA-2", {}, [[{ product_id: productId }, 5, 50]])).purchase_order_id,
        items: [{ goods_receipt_item_id: fast.items[0].goods_receipt_item_id, purchase_order_item_id: (await q(`SELECT purchase_order_item_id FROM purchase_order_items WHERE purchase_order_id = (SELECT MAX(purchase_order_id) FROM purchase_orders WHERE project_id = $1)`, [projectId]))[0].purchase_order_item_id }] });
    assert.equal(relinked.entry_type, "normal");
    assert.equal(relinked.documents.purchase_order, "presente");
    state.fast = fast;
});

test("la lista de ingresos trae el expediente y los avisos de cada uno (para mostrar ✓ y ⚠ sin abrirlos)", async () => {
    const list = await rcsvc.listGoodsReceiptsService(asUser(plainId), ctx(), {});
    assert.equal(list.length, 5);
    assert.ok(list.every((r) => r.documents && Array.isArray(r.alerts)));
    const byNumber = (n, s = "T001") => list.find((r) => r.delivery_note_series === s && r.delivery_note_number === n);
    assert.equal(byNumber("1").documents.invoice, "presente");
    assert.equal(byNumber("3").documents.invoice, "pendiente", "el ingreso 3 recibe la línea 2 y las facturas solo citan la línea 1");
    assert.deepEqual(codes(byNumber("3").alerts), ["FILE_PENDING", "INVOICE_PENDING"]);
    assert.deepEqual(codes(byNumber("1").alerts), ["FILE_PENDING"]);
    assert.equal((await rcsvc.listGoodsReceiptsService(asUser(plainId), ctx(), { entry_type: "rapida" })).length, 0, "ya pasó a normal al vincularse");
});

test("solo cuentan los documentos ACTIVOS: dar de baja una factura o una orden sin ingresos cambia el avance; los ingresos nunca se dan de baja", async () => {
    // Factura dada de baja: deja de contar como facturada.
    await isvc.deleteInvoiceService(owner(), { projectId, invoiceId: setup.inv2.invoice_id });
    let l1 = (await poDetail(setup.poA)).items[0];
    assert.equal(l1.progress.invoiced, "40.000000", "solo queda la factura activa de 40");
    assert.deepEqual(codes(l1.alerts), ["RECEIVED_NOT_INVOICED"]);
    // Una cotización dada de baja deja de contar como oferta de la línea.
    assert.equal((await reqDetail()).items[0].progress.offers_count, 2);
    await qsvc.deleteQuotationService(owner(), { projectId, quotationId: setup.qB.quotation_id });
    assert.equal((await reqDetail()).items[0].progress.offers_count, 1);
    // Una orden sin ingresos para la línea 3 del requerimiento: cuenta como ordenada; dada de baja, vuelve a faltar.
    const poL3 = await mkOrder(supplierA, "OC-L3", { purchase_requisition_id: setup.req.purchase_requisition_id }, [[{ purchase_requisition_item_id: setup.ri[2] }, 30, 300]]);
    let r3 = (await reqDetail()).items[2];
    assert.equal(r3.progress.ordered, "30.000000");
    assert.deepEqual(r3.progress.missing, ["quotation", "invoice", "receipt"], "ordenada pero sin cotizar (orden desde el requerimiento)");
    await psvc.deletePurchaseOrderService(owner(), { projectId, purchaseOrderId: poL3.purchase_order_id });
    r3 = (await reqDetail()).items[2];
    assert.equal(r3.progress.ordered, "0.000000");
    assert.deepEqual(r3.progress.missing, ["quotation", "order", "invoice", "receipt"]);
    assert.equal((await reqDetail()).summary.ordered, 2);
});

test("los avisos de archivo pendiente desaparecen al adjuntar el archivo (requerimiento, cotización, orden, factura e ingreso)", async () => {
    const attach = async (fn, params) => { const f = await makeFile(projectId); await fn(asUser(editorId), params, { file_id: f.fileId }); };
    await attach(rsvc.setPurchaseRequisitionFileService, { projectId, purchaseRequisitionId: setup.req.purchase_requisition_id });
    await attach(qsvc.setQuotationFileService, { projectId, quotationId: setup.qA.quotation_id });
    await attach(psvc.setPurchaseOrderFileService, { projectId, purchaseOrderId: setup.poA.purchase_order_id });
    await attach(isvc.setInvoiceFileService, { projectId, invoiceId: setup.inv1.invoice_id });
    await attach(rcsvc.setGoodsReceiptFileService, { projectId, goodsReceiptId: setup.rc1.goods_receipt_id });
    assert.deepEqual((await reqDetail()).alerts, []);
    assert.deepEqual((await qsvc.getQuotationByIdService(owner(), { projectId, quotationId: setup.qA.quotation_id })).alerts, []);
    assert.deepEqual((await poDetail(setup.poA)).alerts, []);
    assert.deepEqual((await isvc.getInvoiceByIdService(owner(), { projectId, invoiceId: setup.inv1.invoice_id })).alerts, []);
    const rc1 = await rcDetail(setup.rc1);
    assert.equal(rc1.documents.delivery_note_file, "presente");
    assert.deepEqual(codes(rc1.alerts), [], "con orden, factura y archivo no queda ningún aviso de documento");
});

test("si se dan de baja todas las facturas de una orden, el ingreso vuelve a tener la factura pendiente y la línea de requerimiento vuelve a faltar en esa etapa", async () => {
    await isvc.deleteInvoiceService(owner(), { projectId, invoiceId: setup.inv1.invoice_id });
    const rc1 = await rcDetail(setup.rc1);
    assert.equal(rc1.documents.invoice, "pendiente");
    assert.deepEqual(codes(rc1.alerts), ["INVOICE_PENDING"]);
    const l1 = (await poDetail(setup.poA)).items[0];
    assert.equal(l1.progress.invoiced, "0.000000");
    assert.equal(l1.progress.pending_to_invoice, "100.000000");
    assert.deepEqual((await reqDetail()).items[0].progress.missing, ["invoice"]);
    assert.equal((await reqDetail()).summary.invoiced, 0);
});

test("los números derivados coinciden con SQL directo sobre los datos (ordenado, facturado y recibido por línea de requerimiento)", async () => {
    const req = await reqDetail();
    for (const item of req.items) {
        const id = item.purchase_requisition_item_id;
        const ordered = await sumSql(`SELECT SUM(poi.quantity_ordered) AS t FROM purchase_order_items poi JOIN purchase_orders po ON po.purchase_order_id = poi.purchase_order_id AND po.deleted_at IS NULL WHERE poi.purchase_requisition_item_id = $1`, [id]);
        const invoiced = await sumSql(`SELECT SUM(ii.quantity_invoiced) AS t FROM invoice_items ii JOIN invoices v ON v.invoice_id = ii.invoice_id AND v.deleted_at IS NULL JOIN purchase_order_items poi ON poi.purchase_order_item_id = ii.purchase_order_item_id WHERE poi.purchase_requisition_item_id = $1`, [id]);
        const received = await sumSql(`SELECT SUM(gri.total_quantity) AS t FROM goods_receipt_items gri JOIN purchase_order_items poi ON poi.purchase_order_item_id = gri.purchase_order_item_id WHERE poi.purchase_requisition_item_id = $1`, [id]);
        assert.equal(Number(item.progress.ordered), ordered);
        assert.equal(Number(item.progress.invoiced), invoiced);
        assert.equal(Number(item.progress.received), received);
    }
});

test("el estado no toca los datos: pedir el detalle muchas veces no cambia stock ni filas", async () => {
    const before = [(await q(`SELECT COUNT(*)::int AS n FROM goods_receipts`))[0].n, await sumSql(`SELECT SUM(quantity) AS t FROM bin_contents WHERE product_id = $1`, [productId])];
    for (let i = 0; i < 3; i++) { await reqDetail(); await poDetail(setup.poA); await rcDetail(setup.rc1); await rcsvc.listGoodsReceiptsService(owner(), ctx(), {}); }
    const after = [(await q(`SELECT COUNT(*)::int AS n FROM goods_receipts`))[0].n, await sumSql(`SELECT SUM(quantity) AS t FROM bin_contents WHERE product_id = $1`, [productId])];
    assert.deepEqual(after, before);
});

test("vaciar Almacén sigue funcionando con todo el estado derivado", async () => {
    const counts = await emptyAlmacenContentService(owner(), ctx());
    assert.ok(counts.goods_receipts >= 5 && counts.invoices >= 2 && counts.purchase_orders >= 3);
});
