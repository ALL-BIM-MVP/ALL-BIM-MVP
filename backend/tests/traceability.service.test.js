// traceability.service.test.js
//
// Test de integración (BD real) de la Fase 9 de
// docs/almacen-ingreso-productos/05-roadmap.md: (1) trazabilidad DOCUMENTAL — desde
// cualquier documento se recorre la cadena por línea (por elemento), hacia atrás,
// hacia adelante o el conjunto conectado — y (2) hoja de vida del PRODUCTO — su
// historia en el tiempo (pedido, ordenado, facturado, recibido, salido). Solo lectura,
// sin tabla "ingreso" (opción B). Corre contra dist/ ya compilado, sin mocks del driver.
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
let vsSeq = 0;
const vsn = () => `VS-${++vsSeq}`;


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
const tsvc = await import("../dist/services/almacen/traceability.service.js");
const hsvc = await import("../dist/services/almacen/product-history.service.js");
const lsvc = await import("../dist/services/almacen/location-history.service.js");
const gisvc = await import("../dist/services/almacen/goods-issue.service.js");
const tschemas = await import("../dist/schemas/almacen/traceability.schema.js");
const hschemas = await import("../dist/schemas/almacen/product-history.schema.js");
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
const S = {};
const labels = (docs) => docs.map((d) => d.label).sort();
const trace = (type, id, direction, user = owner(), options) => tsvc.getTraceabilityService(user, { projectId, documentType: type, documentId: id }, { direction }, options);
const docSets = (t) => ({ req: labels(t.documents.requisitions), quo: labels(t.documents.quotations), po: labels(t.documents.purchase_orders), inv: labels(t.documents.invoices), rc: labels(t.documents.goods_receipts) });

const mkOrder = (supplier, number, origin, lines) => psvc.createPurchaseOrderService(owner(), ctx(), {
    supplier_id: supplier, number, order_date: "2026-09-15", currency: "PEN", ...origin,
    items: lines.map(([link, qty, total]) => ({ ...link, description: "Según orden", quantity_ordered: qty, line_total: total })),
});
const receive = (supplier, number, order, lines, date, entryType = "normal") => rcsvc.createGoodsReceiptService(owner(), ctx(), {
    supplier_id: supplier, entry_type: entryType, purchase_order_id: order ? order.purchase_order_id : null, delivery_note_series: "T001", delivery_note_number: number,
    delivery_note_date: "2026-09-20", received_date: date,
    items: lines.map(([link, qty, locations]) => ({ ...link, total_quantity: qty, locations })),
});
const invoice = (supplier, number, order, lines, date) => isvc.createInvoiceService(owner(), ctx(), {
    supplier_id: supplier, purchase_order_id: order ? order.purchase_order_id : null, series: "F001", number, invoice_date: date, currency: "PEN",
    items: lines.map(([link, qty]) => ({ ...link, description: "Según factura", quantity_invoiced: qty, unit_price: 10, line_total: qty * 10 })),
});

test("Zod: el tipo de documento y la dirección; por defecto la dirección es all; la hoja de vida solo admite fechas AAAA-MM-DD", () => {
    const { TraceabilityParamSchema: P, TraceabilityQuerySchema: Q } = tschemas;
    for (const t of ["requisition", "quotation", "purchase-order", "invoice", "goods-receipt"]) assert.equal(P.safeParse({ projectId: 1, documentType: t, documentId: 1 }).success, true, t);
    for (const bad of ["ingreso", "purchase_order", "receipt", ""]) assert.equal(P.safeParse({ projectId: 1, documentType: bad, documentId: 1 }).success, false, bad);
    assert.equal(Q.parse({}).direction, "all");
    assert.equal(Q.safeParse({ direction: "sideways" }).success, false);
    const { ProductHistoryQuerySchema: H } = hschemas;
    assert.equal(H.safeParse({ bin_id: "3", from: "2026-09-01", to: "2026-09-30" }).success, true);
    const defaults = H.parse({});
    assert.deepEqual([defaults.type, defaults.sort, defaults.direction, defaults.include_in_progress], ["all", "date", "desc", true]);
    assert.equal(H.parse({ include_in_progress: "false" }).include_in_progress, false);
    for (const bad of [{ type: "todo" }, { sort: "x" }, { direction: "up" }, { include_in_progress: "maybe" }]) assert.equal(H.safeParse(bad).success, false, JSON.stringify(bad));
    for (const bad of [{ from: "01/09/2026" }, { to: "2026-9-1" }, { bin_id: "x" }, { from: "2026-09-01T00:00:00Z" }]) assert.equal(H.safeParse(bad).success, false, JSON.stringify(bad));
});

test("preparar: requerimiento de 3 líneas, dos cotizaciones, dos órdenes, una compra directa, facturas, ingresos y un vale", async () => {
    S.req = await rsvc.createPurchaseRequisitionService(owner(), ctx(), {
        number: "REQ-001", requisition_date: "2026-09-10", requester: "Almacenero",
        items: [
            { product_id: productId, description: "Cemento", quantity_requested: 100 },
            { product_id: productY, description: "Fierro", quantity_requested: 50 },
            { product_id: productId, description: "Cemento para losa", quantity_requested: 30 },
        ],
    });
    S.ri = S.req.items.map((i) => i.purchase_requisition_item_id);
    const rid = S.req.purchase_requisition_id;
    const qbody = (supplier, number, lines) => ({ supplier_id: supplier, purchase_requisition_id: rid, number, quotation_date: "2026-09-12", currency: "PEN",
        items: lines.map(([ri, qty]) => ({ purchase_requisition_item_id: ri, description: "Según cotización", quantity_quoted: qty, line_total: qty * 10 })) });
    S.qA = await qsvc.createQuotationService(owner(), ctx(), qbody(supplierA, "COT-A", [[S.ri[0], 100], [S.ri[1], 50]]));
    S.qB = await qsvc.createQuotationService(owner(), ctx(), qbody(supplierB, "COT-B", [[S.ri[0], 100]]));
    S.poA = await mkOrder(supplierA, "OC-A", { quotation_id: S.qA.quotation_id }, [
        [{ quotation_item_id: S.qA.items[0].quotation_item_id }, 100, 3000], [{ quotation_item_id: S.qA.items[1].quotation_item_id }, 60, 600]]);
    S.poB = await mkOrder(supplierB, "OC-B", { quotation_id: S.qB.quotation_id }, [[{ quotation_item_id: S.qB.items[0].quotation_item_id }, 100, 2800]]);
    S.poD = await mkOrder(supplierA, "OC-D", {}, [[{ product_id: productY }, 5, 50]]);
    const [a1, a2] = S.poA.items.map((i) => ({ purchase_order_item_id: i.purchase_order_item_id }));
    // Ingresos: rc1 60 -> A1; rc2 40 repartido en dos casillas; rc3 la línea 2; una entrada rápida y una normal sin orden.
    S.rc1 = await receive(supplierA, "1", S.poA, [[a1, 60, [{ bin_id: binA, quantity: 60 }]]], "2026-09-21");
    S.rc2 = await receive(supplierA, "2", S.poA, [[a1, 40, [{ bin_id: binA, quantity: 15 }, { bin_id: binB, quantity: 25 }]]], "2026-09-23");
    S.rc3 = await receive(supplierA, "3", S.poA, [[a2, 70, [{ bin_id: binA, quantity: 70 }]]], "2026-09-22");
    S.rcFast = await receive(supplierB, "4", null, [[{ product_id: productId }, 5, [{ bin_id: binA, quantity: 5 }]]], "2026-09-24", "rapida");
    S.rcPending = await receive(supplierB, "5", null, [[{ product_id: productY }, 20, [{ bin_id: binB, quantity: 20 }]]], "2026-09-24", "normal");
    // Facturas: inv1 sobre A1 (40), inv2 sobre A2 (60) y una de la compra directa.
    S.inv1 = await invoice(supplierA, "100", S.poA, [[a1, 40]], "2026-09-22");
    S.inv2 = await invoice(supplierA, "101", S.poA, [[a2, 60]], "2026-09-23");
    S.invD = await invoice(supplierA, "102", S.poD, [[{ purchase_order_item_id: S.poD.items[0].purchase_order_item_id }, 5]], "2026-09-23");
    // Vale: salen 30 de cemento de la casilla A.
    S.issue = await gisvc.createGoodsIssueService(owner(), ctx(), {
        number: vsn(), destination_sector: "Torre A", destination_level: "Piso 3", destination_block: "Bloque B", recipient_name: "Juan Pérez", recipient_dni: "12345678",
        issue_date: "2026-09-25", items: [{ product_id: productId, total_quantity: 30, locations: [{ bin_id: binA, quantity: 30 }] }] });
    assert.equal(S.rc2.items[0].locations.length, 2);
});

test("HACIA ATRÁS desde un ingreso: su cadena de origen y las facturas de la misma línea de orden; nada más", async () => {
    const t = await trace("goods-receipt", S.rc1.goods_receipt_id, "backward");
    assert.equal(t.anchor.type, "goods-receipt");
    assert.equal(t.anchor.label, "T001-1");
    assert.equal(t.truncated, false);
    assert.deepEqual(docSets(t), { req: ["REQ-001"], quo: ["COT-A"], po: ["OC-A"], inv: ["F001-100"], rc: ["T001-1"] });
    assert.equal(t.threads.length, 1, "un solo elemento");
    const th = t.threads[0];
    assert.equal(th.contains_anchor, true);
    assert.equal(String(th.product.product_id), String(productId));
    assert.equal(th.requisition_items.length, 1);
    assert.equal(th.quotation_items.length, 1, "solo la oferta de la que viene la orden (no COT-B)");
    assert.equal(th.purchase_order_items.length, 1);
    assert.equal(th.invoice_items.length, 1, "la factura de la misma línea de orden");
    assert.equal(th.receipt_items.length, 1, "hacia atrás no trae los otros ingresos de la línea");
    assert.deepEqual(th.receipt_items[0].locations.map((l) => [l.quantity, l.label.endsWith("A1")]), [["60.000000", true]], "dónde quedó lo recibido");
    assert.equal(th.invoice_items[0].quantity_invoiced, "40.000000");
    assert.equal(t.documents.goods_receipts[0].is_anchor, true);
    assert.equal(t.documents.purchase_orders[0].is_anchor, false);
    assert.equal(t.documents.goods_receipts[0].entry_type, "normal");
    assert.equal(t.documents.requisitions[0].requester, "Almacenero");
    assert.equal(t.documents.quotations[0].supplier.name, "Cementos del Sur SAC");
    assert.equal(t.documents.quotations[0].has_file, false);
});

test("HACIA ADELANTE desde el requerimiento: todo lo que generó, por elemento (ofertas, órdenes, facturas, ingresos y casillas)", async () => {
    const t = await trace("requisition", S.req.purchase_requisition_id, "forward");
    assert.deepEqual(docSets(t), { req: ["REQ-001"], quo: ["COT-A", "COT-B"], po: ["OC-A", "OC-B"], inv: ["F001-100", "F001-101"], rc: ["T001-1", "T001-2", "T001-3"] });
    assert.equal(t.threads.length, 3, "un hilo por línea del requerimiento");
    const [l1, l2, l3] = t.threads;
    assert.equal(l1.quotation_items.length, 2, "dos ofertas para la línea 1");
    assert.equal(l1.purchase_order_items.length, 2, "adjudicada a dos proveedores");
    assert.equal(l1.invoice_items.length, 1);
    assert.equal(l1.receipt_items.length, 2);
    assert.deepEqual(l1.receipt_items.flatMap((r) => r.locations.map((l) => l.quantity)).sort(), ["15.000000", "25.000000", "60.000000"], "60 en una casilla y 40 repartidos en dos");
    assert.equal(l2.quotation_items.length, 1);
    assert.equal(l2.receipt_items.length, 1);
    assert.equal(String(l2.product.product_id), String(productY));
    assert.deepEqual([l3.quotation_items.length, l3.purchase_order_items.length, l3.invoice_items.length, l3.receipt_items.length], [0, 0, 0, 0], "la línea 3 no avanzó: solo el requerimiento");
    assert.equal(l3.requisition_items.length, 1);
    assert.equal(l1.contains_anchor && l2.contains_anchor && l3.contains_anchor, true);
});

test("el CONJUNTO CONECTADO (all) es por elemento: desde el ingreso 2 llega a todo el elemento de esa línea, no a las otras líneas del requerimiento", async () => {
    const t = await trace("goods-receipt", S.rc2.goods_receipt_id, "all");
    assert.deepEqual(docSets(t), { req: ["REQ-001"], quo: ["COT-A", "COT-B"], po: ["OC-A", "OC-B"], inv: ["F001-100"], rc: ["T001-1", "T001-2"] });
    assert.equal(t.threads.length, 1);
    assert.equal(t.threads[0].receipt_items.length, 2);
    assert.equal(t.threads[0].purchase_order_items.length, 2);
    // Por defecto la dirección es all.
    const byDefault = await tsvc.getTraceabilityService(owner(), { projectId, documentType: "goods-receipt", documentId: S.rc2.goods_receipt_id }, tschemas.TraceabilityQuerySchema.parse({}));
    assert.deepEqual(docSets(byDefault), docSets(t));
});

test("desde otros documentos: la orden (hacia atrás y hacia adelante), la factura y la cotización", async () => {
    const back = await trace("purchase-order", S.poA.purchase_order_id, "backward");
    assert.deepEqual(docSets(back), { req: ["REQ-001"], quo: ["COT-A"], po: ["OC-A"], inv: ["F001-100", "F001-101"], rc: [] }, "atrás: origen y facturas, sin ingresos");
    const fwd = await trace("purchase-order", S.poA.purchase_order_id, "forward");
    assert.deepEqual(docSets(fwd), { req: [], quo: [], po: ["OC-A"], inv: ["F001-100", "F001-101"], rc: ["T001-1", "T001-2", "T001-3"] }, "adelante: facturas e ingresos, sin origen");
    const inv = await trace("invoice", S.inv2.invoice_id, "backward");
    assert.deepEqual(docSets(inv), { req: ["REQ-001"], quo: ["COT-A"], po: ["OC-A"], inv: ["F001-101"], rc: [] });
    const quo = await trace("quotation", S.qB.quotation_id, "forward");
    assert.deepEqual(docSets(quo), { req: [], quo: ["COT-B"], po: ["OC-B"], inv: [], rc: [] }, "la oferta B se adjudicó pero no tiene facturas ni ingresos");
    assert.equal(quo.threads.length, 1);
});

test("elementos sin vínculos: la entrada rápida, el ingreso normal sin orden y la compra directa forman su propio hilo", async () => {
    const fast = await trace("goods-receipt", S.rcFast.goods_receipt_id, "all");
    assert.deepEqual(docSets(fast), { req: [], quo: [], po: [], inv: [], rc: ["T001-4"] });
    assert.equal(fast.documents.goods_receipts[0].entry_type, "rapida");
    assert.equal(fast.threads.length, 1);
    assert.equal(fast.threads[0].receipt_items[0].locations[0].quantity, "5.000000");
    assert.equal(fast.threads[0].requisition_items.length + fast.threads[0].purchase_order_items.length, 0);
    const pending = await trace("goods-receipt", S.rcPending.goods_receipt_id, "backward");
    assert.deepEqual(docSets(pending), { req: [], quo: [], po: [], inv: [], rc: ["T001-5"] });
    const direct = await trace("purchase-order", S.poD.purchase_order_id, "all");
    assert.deepEqual(docSets(direct), { req: [], quo: [], po: ["OC-D"], inv: ["F001-102"], rc: [] }, "la compra directa no tiene requerimiento ni cotización");
    assert.equal(direct.threads.length, 1);
    assert.equal(direct.threads[0].invoice_items.length, 1);
});

test("un documento de otro proyecto, inexistente o dado de baja da 404; el permiso es de lectura; el tope de líneas avisa con `truncated`", async () => {
    await assert.rejects(tsvc.getTraceabilityService(owner(), { projectId: otherProjectId, documentType: "goods-receipt", documentId: S.rc1.goods_receipt_id }, { direction: "all" }), codeOf("TRACEABILITY_DOCUMENT_NOT_FOUND"));
    await assert.rejects(trace("requisition", 999999999, "all"), codeOf("TRACEABILITY_DOCUMENT_NOT_FOUND"));
    await assert.rejects(trace("goods-receipt", 999999999, "all"), codeOf("TRACEABILITY_DOCUMENT_NOT_FOUND"));
    assert.equal((await trace("goods-receipt", S.rc1.goods_receipt_id, "all", asUser(plainId))).anchor.label, "T001-1", "un miembro con solo lectura puede consultar");
    await assert.rejects(trace("goods-receipt", S.rc1.goods_receipt_id, "all", asUser(outsiderId)), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    const cut = await trace("requisition", S.req.purchase_requisition_id, "forward", owner(), { maxLines: 3 });
    assert.equal(cut.truncated, true, "el recorrido se cortó por el tope");
    assert.equal((await trace("requisition", S.req.purchase_requisition_id, "forward")).truncated, false);
});

test("solo cuentan los documentos ACTIVOS: una orden o una factura dada de baja desaparece del recorrido y no se puede usar de ancla", async () => {
    // La orden B (sin facturas ni ingresos) se da de baja.
    await psvc.deletePurchaseOrderService(owner(), { projectId, purchaseOrderId: S.poB.purchase_order_id });
    let t = await trace("requisition", S.req.purchase_requisition_id, "forward");
    assert.deepEqual(docSets(t).po, ["OC-A"]);
    assert.equal(t.threads[0].purchase_order_items.length, 1);
    await assert.rejects(trace("purchase-order", S.poB.purchase_order_id, "all"), codeOf("TRACEABILITY_DOCUMENT_NOT_FOUND"));
    // Una factura dada de baja deja de aparecer.
    await isvc.deleteInvoiceService(owner(), { projectId, invoiceId: S.inv1.invoice_id });
    t = await trace("goods-receipt", S.rc1.goods_receipt_id, "backward");
    assert.deepEqual(docSets(t).inv, []);
    assert.equal(t.threads[0].invoice_items.length, 0);
    await assert.rejects(trace("invoice", S.inv1.invoice_id, "all"), codeOf("TRACEABILITY_DOCUMENT_NOT_FOUND"));
    t = await trace("requisition", S.req.purchase_requisition_id, "forward");
    assert.deepEqual(docSets(t).inv, ["F001-101"], "hacia adelante tampoco aparece la factura dada de baja");
    // Un requerimiento dado de baja tampoco cuenta (ni en el recorrido ni en la hoja de vida del producto).
    const extra = await rsvc.createPurchaseRequisitionService(owner(), ctx(), {
        number: "REQ-BAJA", requisition_date: "2026-09-11", requester: "Otro", items: [{ product_id: productId, description: "Cemento (dado de baja)", quantity_requested: 7 }] });
    await rsvc.deletePurchaseRequisitionService(owner(), { projectId, purchaseRequisitionId: extra.purchase_requisition_id });
    await assert.rejects(trace("requisition", extra.purchase_requisition_id, "all"), codeOf("TRACEABILITY_DOCUMENT_NOT_FOUND"));
});

// ---------------------------------------------------------------------------------------------
// Hoja de vida del PRODUCTO
// ---------------------------------------------------------------------------------------------
const history = (query = {}, product = productId, user = owner()) => hsvc.getProductHistoryService(user, { projectId, productId: product }, query);

test("HOJA DE VIDA del producto: stock actual, totales y una lista con entradas (ingresos con sus documentos) y salidas (vales)", async () => {
    const h = await history();
    assert.equal(h.product.code, "T-1");
    assert.deepEqual(h.filters, { bin_id: null, from: null, to: null, type: "all", sort: "date", direction: "desc", include_in_progress: true });
    // Entraron 60 + 15 + 25 + 5 = 105 y salieron 30 -> quedan 75: 50 en A1 y 25 en A2.
    assert.deepEqual(h.totals, { entered: "105.000000", exited: "30.000000", net: "75.000000" });
    assert.equal(h.stock.total, "75.000000");
    assert.deepEqual(h.stock.by_bin.map((b) => [b.quantity, b.label.split(" · ").pop()]), [["50.000000", "A1"], ["25.000000", "A2"]], "por casilla, con su nombre completo");
    assert.equal(h.truncated, false);

    const entries = h.items.filter((i) => i.type === "entrada");
    const exits = h.items.filter((i) => i.type === "salida");
    assert.equal(entries.filter((e) => e.status === "recibido").length, 3, "T001-1, T001-2 y la entrada rápida T001-4");
    assert.equal(entries.filter((e) => e.status === "en_curso").length, 1, "la línea 3 del requerimiento aún no tiene orden ni guía");
    assert.equal(exits.length, 1);
    const dates = h.items.map((i) => i.date);
    assert.deepEqual(dates, [...dates].sort().reverse(), "mezclado por fecha, el más reciente primero");
    assert.equal(h.items[0].type, "salida");
    assert.equal(h.items[0].date, "2026-09-25");
});

test("una ENTRADA es un ingreso que se despliega en sus documentos (repetidos en cada guía); la rápida no tiene documentos previos", async () => {
    const h = await history();
    const entry = (label) => h.items.find((i) => i.type === "entrada" && i.status === "recibido" && i.label === label);
    const second = entry("T001-2");
    assert.equal(second.receipt.supplier.ruc, "20123456789");
    assert.equal(second.receipt.supplier.name, "Cementos del Sur SAC");
    assert.equal(second.receipt.delivery_note_date, "2026-09-20");
    assert.equal(second.receipt.received_date, "2026-09-23");
    assert.equal(second.receipt.entry_type, "normal");
    assert.deepEqual(second.locations.map((l) => l.quantity), ["15.000000", "25.000000"]);
    assert.deepEqual([second.quantity_registered, second.quantity_adjusted, second.quantity_effective], ["40.000000", "0.000000", "40.000000"]);
    assert.deepEqual(second.adjustments, []);
    // Los mismos documentos de origen aparecen completos en las dos guías de la misma orden.
    for (const label of ["T001-1", "T001-2"]) {
        const d = entry(label).documents;
        assert.deepEqual([d.requisitions.map((x) => x.label), d.quotations.map((x) => x.label), d.purchase_orders.map((x) => x.label), d.invoices.length],
            [["REQ-001"], ["COT-A"], ["OC-A"], 0], label);
    }
    const d = entry("T001-2").documents;
    assert.equal(d.requisitions[0].requester, "Almacenero");
    assert.equal(d.requisitions[0].quantity, "100.000000");
    assert.equal(d.quotations[0].supplier.ruc, "20123456789");
    assert.equal(d.purchase_orders[0].currency, "PEN");
    assert.equal(d.purchase_orders[0].line_total, "3000.000000");
    const fast = entry("T001-4");
    assert.equal(fast.receipt.entry_type, "rapida");
    assert.deepEqual([fast.documents.requisitions, fast.documents.quotations, fast.documents.purchase_orders, fast.documents.invoices], [[], [], [], []]);
});

test("una entrada EN CURSO tiene documentos previos pero ninguna guía: sin recibo ni cantidades recibidas", async () => {
    const h = await history();
    const pending = h.items.find((i) => i.type === "entrada" && i.status === "en_curso");
    assert.equal(pending.receipt, null);
    assert.deepEqual([pending.quantity_registered, pending.quantity_effective], [null, null]);
    assert.deepEqual(pending.locations, []);
    assert.equal(pending.documents.requisitions[0].description, "Cemento para losa");
    assert.equal(pending.documents.requisitions[0].label, "REQ-001");
    assert.equal(pending.date, "2026-09-10", "la del documento más reciente de la cadena");
    // Sin las "en curso" y sin duplicar lo ya recibido.
    const without = await history({ include_in_progress: false });
    assert.equal(without.items.filter((i) => i.status === "en_curso").length, 0);
    assert.equal(without.items.length, h.items.length - 1);
});

test("una SALIDA es un solo documento con su número, destino y responsable (sin DNI), y los saldos coinciden con el Kardex", async () => {
    const h = await history();
    const exit = h.items.find((i) => i.type === "salida");
    assert.equal(exit.label, exit.issue.number);
    assert.equal(exit.issue.destination_sector, "Torre A");
    assert.equal(exit.issue.destination_level, "Piso 3");
    assert.equal(exit.issue.destination_block, "Bloque B");
    assert.equal(exit.issue.recipient_name, "Juan Pérez");
    assert.deepEqual([exit.quantity_registered, exit.quantity_effective], ["30.000000", "30.000000"]);
    assert.equal(JSON.stringify(h).includes("recipient_dni"), false, "el DNI de quien retira no se expone en la historia");
    // El saldo de cada casilla es el snapshot del Kardex (mismos valores, sin importar el orden).
    const balances = h.items.flatMap((i) => i.locations.map((l) => Number(l.balance_after))).sort((x, y) => x - y);
    const kardex = await kdxsvc.listInventoryMovementsService(owner(), ctx(), { product_id: productId });
    assert.equal(balances.length, kardex.length);
    assert.deepEqual(balances, kardex.map((k) => Number(k.resulting_balance)).sort((x, y) => x - y));
});

test("FILTROS y ORDEN: tipo, sort (mezclado o agrupado), direction, fechas y casilla", async () => {
    const types = (h) => h.items.map((i) => i.type);
    assert.deepEqual([...new Set(types(await history({ type: "entrada" })))], ["entrada"]);
    assert.deepEqual(types(await history({ type: "salida" })), ["salida"]);
    const entriesFirst = types(await history({ sort: "entrada_first" }));
    assert.deepEqual(entriesFirst, [...entriesFirst].sort().reverse().sort((x, y) => (x === "entrada" ? -1 : 1) - (y === "entrada" ? -1 : 1)));
    assert.equal(entriesFirst.at(-1), "salida");
    const exitsFirst = await history({ sort: "salida_first" });
    assert.equal(exitsFirst.items[0].type, "salida");
    const entriesInOrder = exitsFirst.items.filter((i) => i.type === "entrada").map((i) => i.date);
    assert.deepEqual(entriesInOrder, [...entriesInOrder].sort().reverse(), "dentro de cada grupo, por fecha");
    const asc = await history({ direction: "asc" });
    assert.deepEqual(asc.items.map((i) => i.date), [...asc.items.map((i) => i.date)].sort());
    assert.deepEqual((await history({ direction: "asc", sort: "salida_first" })).filters, { bin_id: null, from: null, to: null, type: "all", sort: "salida_first", direction: "asc", include_in_progress: true });

    const binBHistory = await history({ bin_id: binB });
    assert.equal(binBHistory.stock.total, "25.000000");
    assert.equal(binBHistory.filters.bin_id, String(binB), "los ids también viajan como texto en los filtros");
    assert.deepEqual(binBHistory.totals, { entered: "25.000000", exited: "0.000000", net: "25.000000" });
    assert.equal(binBHistory.items.length, 1, "solo el ingreso que dejó material en esa casilla (y sin entradas en curso)");
    assert.equal(binBHistory.items[0].label, "T001-2");
    assert.deepEqual(binBHistory.items[0].locations.map((l) => [l.bin_id, l.quantity]).map(([b, qty]) => [String(b), qty]), [[String(binB), "25.000000"]], "solo las casillas filtradas");

    const late = await history({ from: "2026-09-24" });
    assert.deepEqual(late.totals, { entered: "5.000000", exited: "30.000000", net: "-25.000000" }, "los totales son del rango");
    assert.equal(late.stock.total, "75.000000", "el stock actual no depende de las fechas");
    assert.ok(late.items.every((i) => i.date >= "2026-09-24"));
    assert.equal((await history({ from: "2026-12-01" })).items.length, 0);
    assert.equal((await history({ to: "2026-09-21" })).items.filter((i) => i.type === "salida").length, 0);
});

test("otro producto tiene su propia historia; un producto o una casilla de otro proyecto dan 404; el permiso es de lectura", async () => {
    const y = await history({}, productY);
    assert.equal(y.product.code, "T-2");
    assert.deepEqual(y.totals, { entered: "90.000000", exited: "0.000000", net: "90.000000" }, "rc3 (70) + el ingreso normal sin orden (20)");
    const withoutOrder = y.items.find((i) => i.status === "recibido" && i.receipt.entry_type === "normal" && i.documents.purchase_orders.length === 0);
    assert.ok(withoutOrder, "el ingreso normal sin orden se ve como tal, sin documentos previos");
    await assert.rejects(history({}, otherProductId), codeOf("PRODUCT_NOT_FOUND"));
    await assert.rejects(history({ bin_id: 999999999 }), codeOf("BIN_NOT_FOUND"));
    assert.equal((await history({}, productId, asUser(plainId))).product.code, "T-1");
    await assert.rejects(history({}, productId, asUser(outsiderId)), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
});

// ---------------------------------------------------------------------------------------------
// Hoja de vida de una UBICACIÓN (estante y casilla)
// ---------------------------------------------------------------------------------------------
test("HOJA DE VIDA de la ubicación: qué hay ahora y los movimientos físicos de todos los productos, con los mismos filtros", async () => {
    const [{ warehouse_id: warehouseId, rack_id: rackId }] = await q(
        `SELECT w.warehouse_id, r.rack_id FROM racks r JOIN warehouses w ON w.warehouse_id = r.warehouse_id WHERE w.project_id = $1`, [projectId]);
    const ctxRack = { projectId, warehouseId, rackId };
    const rack = await lsvc.getRackHistoryService(owner(), ctxRack, {});
    assert.equal(rack.location.level, "rack");
    assert.equal(rack.location.bin, null);
    assert.deepEqual(rack.contents.map((c) => [c.product.code, c.quantity]), [["T-1", "75.000000"], ["T-2", "90.000000"]]);
    assert.equal(rack.contents[0].product.display_id, 1);
    // T-1: 4 entradas + 1 salida; T-2: rc3 y el ingreso sin orden.
    assert.equal(rack.items.length, 7);
    assert.equal(rack.items.filter((m) => m.type === "salida").length, 1);
    const dates = rack.items.map((m) => m.date);
    assert.deepEqual(dates, [...dates].sort().reverse());
    const receipt = rack.items.find((m) => m.document.label === "T001-2" && m.bin.label.endsWith("A2"));
    assert.equal(receipt.type, "entrada");
    assert.equal(receipt.supplier.ruc, "20123456789");
    assert.equal(receipt.quantity, "25.000000");
    assert.equal(receipt.balance_after, "100.000000", "saldo TOTAL del producto después del movimiento (igual que el Kardex)");
    const issue = rack.items.find((m) => m.type === "salida");
    assert.equal(issue.destination, "Torre A · Piso 3 · Bloque B");
    assert.equal(issue.recipient_name, "Juan Pérez");
    assert.equal(JSON.stringify(rack).includes("recipient_dni"), false);

    assert.equal((await lsvc.getRackHistoryService(owner(), ctxRack, { type: "entrada" })).items.length, 6);
    assert.equal((await lsvc.getRackHistoryService(owner(), ctxRack, { product_id: productId })).items.length, 5);
    assert.equal((await lsvc.getRackHistoryService(owner(), ctxRack, { sort: "salida_first" })).items[0].type, "salida");
    const asc = await lsvc.getRackHistoryService(owner(), ctxRack, { direction: "asc" });
    assert.deepEqual(asc.items.map((m) => m.date), [...asc.items.map((m) => m.date)].sort());
    assert.equal((await lsvc.getRackHistoryService(owner(), ctxRack, { from: "2026-09-25" })).items.length, 1);

    const inB = await lsvc.getBinHistoryService(owner(), { ...ctxRack, binId: binB }, {});
    assert.equal(inB.location.level, "bin");
    assert.equal(String(inB.location.bin.bin_id), String(binB));
    assert.deepEqual(inB.contents.map((c) => [c.product.code, c.quantity]), [["T-1", "25.000000"], ["T-2", "20.000000"]]);
    assert.equal(inB.items.length, 2, "solo lo que pasó por la casilla A2");
    assert.ok(inB.items.every((m) => String(m.bin.bin_id) === String(binB)));

    await assert.rejects(lsvc.getRackHistoryService(owner(), { ...ctxRack, rackId: 999999999 }, {}), codeOf("RACK_NOT_FOUND"));
    await assert.rejects(lsvc.getBinHistoryService(owner(), { ...ctxRack, binId: 999999999 }, {}), codeOf("BIN_NOT_FOUND"));
    assert.equal((await lsvc.getRackHistoryService(asUser(plainId), ctxRack, {})).items.length, 7, "el permiso es de lectura");
    await assert.rejects(lsvc.getRackHistoryService(asUser(outsiderId), ctxRack, {}), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    const { LocationHistoryQuerySchema: L } = await import("../dist/schemas/almacen/location-history.schema.js");
    assert.equal(L.safeParse({ type: "entrada", sort: "salida_first", direction: "asc", product_id: "3", from: "2026-09-01" }).success, true);
    for (const bad of [{ type: "todo" }, { sort: "x" }, { direction: "up" }, { from: "01/09/2026" }]) assert.equal(L.safeParse(bad).success, false, JSON.stringify(bad));
});

test("los ids BIGINT viajan SIEMPRE como texto (también dentro de objetos embebidos); solo los INT son números", async () => {
    const INT_IDS = new Set(["display_id", "next_display_id", "supplier_id", "category_id", "base_category_id", "warehouse_id", "project_id", "warehouse_style_id", "created_by", "updated_by", "voided_by"]);
    const offenders = [];
    const walk = (value, where) => {
        if (Array.isArray(value)) return value.forEach((v) => walk(v, where));
        if (!value || typeof value !== "object") return;
        for (const [key, v] of Object.entries(value)) {
            const isId = key.endsWith("_id") || key === "id" || key === "item_id";
            if (isId && !INT_IDS.has(key) && typeof v === "number") offenders.push(`${where}: ${key}`);
            walk(v, where);
        }
    };
    const [{ warehouse_id: warehouseId, rack_id: rackId }] = await q(
        `SELECT w.warehouse_id, r.rack_id FROM racks r JOIN warehouses w ON w.warehouse_id = r.warehouse_id WHERE w.project_id = $1`, [projectId]);
    walk(await trace("requisition", S.req.purchase_requisition_id, "all"), "trazabilidad");
    walk(await history(), "hoja de vida");
    walk(await history({ bin_id: binA }), "hoja de vida (casilla)");
    walk(await lsvc.getRackHistoryService(owner(), { projectId, warehouseId, rackId }, { product_id: productId }), "ubicación");
    walk(await kdxsvc.listInventoryMovementsService(owner(), ctx(), {}), "kardex");
    walk(await rcsvc.getGoodsReceiptByIdService(owner(), { projectId, goodsReceiptId: S.rc2.goods_receipt_id }), "ingreso");
    walk(await gisvc.getGoodsIssueByIdService(owner(), { projectId, goodsIssueId: S.issue.goods_issue_id }), "vale");
    walk(await psvc.getPurchaseOrderByIdService(owner(), { projectId, purchaseOrderId: S.poA.purchase_order_id }), "orden");
    walk(await qsvc.getQuotationByIdService(owner(), { projectId, quotationId: S.qA.quotation_id }), "cotización");
    walk(await rsvc.getPurchaseRequisitionByIdService(owner(), { projectId, purchaseRequisitionId: S.req.purchase_requisition_id }), "requerimiento");
    assert.deepEqual(offenders, []);
});

test("una orden hecha solo desde el requerimiento (sin cotización) se une a la línea del requerimiento en su hilo", async () => {
    const poR = await mkOrder(supplierB, "OC-R", { purchase_requisition_id: S.req.purchase_requisition_id }, [[{ purchase_requisition_item_id: S.ri[2] }, 30, 300]]);
    const t = await trace("requisition", S.req.purchase_requisition_id, "forward");
    assert.ok(labels(t.documents.purchase_orders).includes("OC-R"));
    const l3 = t.threads.find((th) => th.requisition_items.some((r) => String(r.id) === String(S.ri[2])));
    assert.equal(l3.purchase_order_items.length, 1, "la orden queda en el hilo de la línea 3, no aparte");
    assert.equal(t.threads.length, 3, "sigue habiendo un hilo por línea del requerimiento");
    const back = await trace("purchase-order", poR.purchase_order_id, "backward");
    assert.deepEqual(docSets(back), { req: ["REQ-001"], quo: [], po: ["OC-R"], inv: [], rc: [] });
    assert.equal(back.threads.length, 1);
    assert.equal(back.threads[0].requisition_items.length, 1);
    // En la hoja de vida, la línea ya no está "solo pedida": ahora hay una orden en curso (sin guía).
    const inProgress = (await history()).items.filter((i) => i.status === "en_curso");
    assert.equal(inProgress.length, 1);
    assert.deepEqual([inProgress[0].documents.requisitions.map((d) => d.label), inProgress[0].documents.purchase_orders.map((d) => d.label)], [["REQ-001"], ["OC-R"]]);
});

test("una casilla que quedó en cero ya no figura en el stock actual, pero sus movimientos siguen en la historia", async () => {
    await gisvc.createGoodsIssueService(owner(), ctx(), {
        number: vsn(), destination_sector: "Torre B", destination_level: "Piso 1", destination_block: "Bloque A", recipient_name: "Ana Ruiz", recipient_dni: "87654321",
        issue_date: "2026-09-26", items: [{ product_id: productId, total_quantity: 25, locations: [{ bin_id: binB, quantity: 25 }] }] });
    const h = await history();
    assert.deepEqual(h.stock.by_bin.map((b) => b.quantity), ["50.000000"], "la casilla A2 quedó en cero y no se lista");
    assert.equal(h.stock.total, "50.000000");
    assert.deepEqual(h.totals, { entered: "105.000000", exited: "55.000000", net: "50.000000" });
    const inB = await history({ bin_id: binB });
    assert.equal(inB.stock.total, "0.000000");
    assert.deepEqual(inB.stock.by_bin, []);
    assert.equal(inB.items.length, 2, "la entrada de 25 y la salida de 25 siguen en la historia de la casilla");
    assert.equal(inB.items[0].type, "salida");
});

test("la trazabilidad y la hoja de vida no modifican nada", async () => {
    // Acotado a ESTE proyecto: los archivos de test corren en paralelo y comparten la base.
    const snapshot = async () => JSON.stringify([
        (await q(`SELECT COUNT(*)::int AS n FROM goods_receipts WHERE project_id = $1`, [projectId]))[0].n,
        (await q(`SELECT COALESCE(SUM(bc.quantity),0)::text AS t FROM bin_contents bc JOIN products p ON p.product_id = bc.product_id WHERE p.project_id = $1`, [projectId]))[0].t,
        (await q(`SELECT COUNT(*)::int AS n FROM inventory_movements im JOIN products p ON p.product_id = im.product_id WHERE p.project_id = $1`, [projectId]))[0].n,
    ]);
    const before = await snapshot();
    for (let i = 0; i < 3; i++) { await trace("requisition", S.req.purchase_requisition_id, "all"); await history(); await history({ bin_id: binA }); }
    assert.equal(await snapshot(), before);
});

test("EN CURSO: una orden cuya única guía fue anulada vuelve a estar en curso, y un requerimiento dado de baja no aparece", async () => {
    const asvc = await import("../dist/services/almacen/inventory-adjustment.service.js");
    const supplier = (await ssvc.createSupplierService(owner(), ctx(), { ruc: "20111111111", name: "Proveedor de la prueba" })).supplier_id;
    const order = await mkOrder(supplier, "OC-V", {}, [[{ product_id: productId }, 4, 40]]);
    const line = { purchase_order_item_id: order.items[0].purchase_order_item_id };
    const inProgress = async () => (await history()).items.filter((i) => i.status === "en_curso" && i.documents.purchase_orders.some((d) => d.label === "OC-V"));
    assert.equal((await inProgress()).length, 1, "recién ordenada: en curso");
    const rc = await receive(supplier, "90", order, [[line, 4, [{ bin_id: binA, quantity: 4 }]]], "2026-09-27");
    assert.equal((await inProgress()).length, 0, "con su guía ya no está en curso");
    await asvc.voidGoodsReceiptService(owner(), ctx(), rc.goods_receipt_id, { reason: "Guía equivocada" });
    const after = await history();
    const voided = after.items.find((i) => i.status === "recibido" && i.label === "T001-90");
    assert.equal(voided.voided, true);
    assert.equal(voided.quantity_effective, "0.000000");
    assert.equal((await inProgress()).length, 1, "la guía anulada no cuenta: la orden vuelve a estar en curso");

    const removed = await rsvc.createPurchaseRequisitionService(owner(), ctx(), {
        number: "REQ-BAJA-2", requisition_date: "2026-09-11", requester: "Otro", items: [{ product_id: productId, description: "Cemento dado de baja", quantity_requested: 9 }] });
    const listed = async () => (await history()).items.some((i) => i.type === "entrada" && i.documents.requisitions.some((d) => d.description === "Cemento dado de baja"));
    assert.equal(await listed(), true);
    await rsvc.deletePurchaseRequisitionService(owner(), { projectId, purchaseRequisitionId: removed.purchase_requisition_id });
    assert.equal(await listed(), false, "un documento dado de baja sale de la hoja de vida");
});

test("vaciar Almacén sigue funcionando", async () => {
    const counts = await emptyAlmacenContentService(owner(), ctx());
    assert.ok(counts.goods_receipts >= 5 && counts.purchase_orders >= 3);
});
