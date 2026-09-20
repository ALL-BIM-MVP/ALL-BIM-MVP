// purchase-orders.service.test.js
//
// Test de integración (BD real) de la Fase 5 de
// docs/almacen-ingreso-productos/05-roadmap.md: órdenes de compra con origen
// OPCIONAL (cotización, requerimiento o ninguno), snapshot propio, varias
// órdenes por requerimiento, candados sobre cotizaciones/requerimientos, archivo
// y permisos. Corre contra dist/ ya compilado, sin mocks del driver.
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
const schemas = await import("../dist/schemas/almacen/purchase-order.schema.js");
const psvc = await import("../dist/services/almacen/purchase-order.service.js");

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
const oparams = (id, extra = {}) => ({ projectId, purchaseOrderId: id, ...extra });
const reqBody = (overrides = {}) => ({
    number: "REQ-001", requisition_date: "2026-09-10", requester: "Almacenero",
    items: [
        { product_id: productId, description: "Cemento", quantity_requested: 100 },
        { product_id: productId, description: "Cemento para columnas", quantity_requested: 40 },
        { product_id: productId, description: "Cemento para losa", quantity_requested: 60 },
    ],
    ...overrides,
});
const qBody = (supplier, number, requisitionId, lines, over = {}) => ({
    supplier_id: supplier, purchase_requisition_id: requisitionId, number, quotation_date: "2026-09-12", currency: "PEN",
    items: lines.map(([reqItemId, qty, total]) => ({ purchase_requisition_item_id: reqItemId, description: "Según cotización", quantity_quoted: qty, unit_price: total / qty, line_total: total })),
    ...over,
});
const poBody = (overrides = {}) => ({
    supplier_id: supplierA, quotation_id: state.qA?.quotation_id, number: "OC-001", order_date: "2026-09-15", currency: "PEN", total_amount: 2000,
    items: [{ quotation_item_id: state.qA?.items[0].quotation_item_id, description: "Cemento Sol (según orden)", quantity_ordered: 60, unit_price: 31, line_total: 1860 }],
    ...overrides,
});
const directLine = (over = {}) => ({ product_id: productId, description: "Compra directa", quantity_ordered: 5, line_total: 50, ...over });

test("Zod: origen opcional, vínculos opcionales, moneda cerrada, total de línea obligatorio", () => {
    const { CreatePurchaseOrderBodySchema: Create, UpdatePurchaseOrderBodySchema: Patch, UpdatePurchaseOrderItemBodySchema: PatchItem,
        SetPurchaseOrderFileBodySchema: SetFile, ListPurchaseOrdersQuerySchema: List } = schemas;
    const ok = { supplier_id: 1, number: "OC-1", order_date: "2026-09-15", currency: "PEN", items: [{ product_id: 1, description: "x", quantity_ordered: 1, line_total: 10 }] };
    assert.equal(Create.safeParse(ok).success, true, "compra directa: sin requerimiento ni cotización");
    assert.equal(Create.safeParse({ ...ok, quotation_id: 3, purchase_requisition_id: null }).success, true);
    assert.equal(Create.safeParse({ ...ok, items: [{ quotation_item_id: 5, description: "x", quantity_ordered: 1, line_total: 1 }] }).success, true, "sin product_id si cita una línea");
    for (const bad of ["EUR", "pen", "", undefined]) assert.equal(Create.safeParse({ ...ok, currency: bad }).success, false, `moneda ${String(bad)}`);
    assert.equal(Create.safeParse({ ...ok, items: [] }).success, false);
    assert.equal(Create.safeParse({ ...ok, order_date: "15/09/2026" }).success, false);
    assert.equal(Create.safeParse({ ...ok, number: "  " }).success, false);
    assert.equal(Create.safeParse({ ...ok, total_amount: -1 }).success, false);
    const line = ok.items[0];
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, line_total: undefined }] }).success, false, "line_total obligatorio");
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, unit_price: null, discount_amount: null, tax_amount: null }] }).success, true, "solo total");
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, quantity_ordered: 0 }] }).success, false);
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, line_total: 1e15 }] }).success, false);
    assert.equal(Patch.safeParse({}).success, false);
    assert.equal(Patch.safeParse({ total_amount: null, commercial_terms: null }).success, true);
    assert.equal(Patch.safeParse({ supplier_id: 2 }).success, false, "el proveedor no se cambia por PATCH");
    assert.equal(PatchItem.safeParse({ unit_price: null }).success, true);
    assert.equal(PatchItem.safeParse({ product_id: 2 }).success, false, "el producto no se cambia por PATCH");
    assert.equal(SetFile.safeParse({}).success, false);
    assert.equal(List.safeParse({ supplier_id: "x" }).success, false);
});

test("preparar: un requerimiento con 3 líneas y dos cotizaciones de proveedores distintos", async () => {
    state.req = await rsvc.createPurchaseRequisitionService(owner(), { projectId }, reqBody());
    state.ri = state.req.items.map((i) => i.purchase_requisition_item_id);
    const rid = state.req.purchase_requisition_id;
    state.qA = await qsvc.createQuotationService(owner(), { projectId }, qBody(supplierA, "COT-A", rid, [[state.ri[0], 100, 3000], [state.ri[1], 40, 1200]]));
    state.qB = await qsvc.createQuotationService(owner(), { projectId }, qBody(supplierB, "COT-B", rid, [[state.ri[0], 100, 2800]]));
    assert.equal(state.qA.items.length, 2);
});

test("crear desde una cotización, solo algunas líneas y con su propia copia: se deduce el requerimiento, el producto y la línea", async () => {
    const po = await psvc.createPurchaseOrderService(owner(), { projectId }, poBody());
    state.po1 = po;
    assert.equal(po.number, "OC-001");
    assert.equal(po.order_date, "2026-09-15");
    assert.equal(po.currency, "PEN");
    assert.equal(po.supplier.ruc, "20123456789");
    assert.equal(po.quotation.number, "COT-A");
    assert.equal(po.purchase_requisition.number, "REQ-001", "el requerimiento se deduce de la cotización");
    assert.equal(po.total_amount, "2000.000000");
    assert.equal(po.lines_total, "1860.000000");
    assert.equal(po.items.length, 1, "solo una de las 2 líneas cotizadas");
    const line = po.items[0];
    assert.equal(line.quantity_ordered, "60.000000", "cantidad propia (la cotización decía 100)");
    assert.equal(line.quotation_item.quantity_quoted, "100.000000");
    assert.equal(String(line.purchase_requisition_item_id), String(state.ri[0]), "línea de requerimiento deducida");
    assert.equal(line.requisition_item.quantity_requested, "100.000000");
    assert.equal(String(line.product.product_id), String(productId));
    assert.equal(po.file, null);
    state.po1Item = line.purchase_order_item_id;
});

test("varias órdenes por requerimiento: la misma línea de cotización en dos órdenes; otro proveedor; y una sin origen (compra directa)", async () => {
    const again = await psvc.createPurchaseOrderService(owner(), { projectId }, poBody({ number: "OC-002", items: [
        { quotation_item_id: state.qA.items[0].quotation_item_id, description: "Cemento (pedido escalonado)", quantity_ordered: 40, line_total: 1240 } ] }));
    state.po2 = again;
    const fromB = await psvc.createPurchaseOrderService(owner(), { projectId }, poBody({
        supplier_id: supplierB, quotation_id: state.qB.quotation_id, number: "OC-003", total_amount: null, currency: "USD",
        items: [{ quotation_item_id: state.qB.items[0].quotation_item_id, description: "Cemento Andino", quantity_ordered: 100, line_total: 2800 }] }));
    state.po3 = fromB;
    assert.equal(fromB.currency, "USD");
    assert.equal(fromB.total_amount, null);
    const direct = await psvc.createPurchaseOrderService(owner(), { projectId }, {
        supplier_id: supplierA, number: "OC-004", order_date: "2026-09-16", currency: "PEN", items: [directLine()] });
    state.po4 = direct;
    assert.equal(direct.quotation, null, "compra directa");
    assert.equal(direct.purchase_requisition, null);
    assert.equal(direct.items[0].quotation_item, null);
    assert.equal(direct.items[0].requisition_item, null);
    const byReq = await psvc.listPurchaseOrdersService(asUser(plainId), { projectId }, { purchase_requisition_id: state.req.purchase_requisition_id });
    assert.equal(byReq.length, 3, "3 órdenes del mismo requerimiento");
});

test("solo requerimiento como origen: las líneas citan líneas del requerimiento; toda línea con origen debe citarlo", async () => {
    const rid = state.req.purchase_requisition_id;
    const fromReq = await psvc.createPurchaseOrderService(owner(), { projectId }, {
        supplier_id: supplierB, purchase_requisition_id: rid, number: "OC-005", order_date: "2026-09-17", currency: "PEN",
        items: [{ purchase_requisition_item_id: state.ri[2], description: "Cemento para losa", quantity_ordered: 60, line_total: 700 }] });
    state.po5 = fromReq;
    assert.equal(fromReq.quotation, null);
    assert.equal(fromReq.purchase_requisition.number, "REQ-001");
    assert.equal(String(fromReq.items[0].product_id), String(productId), "producto deducido de la línea del requerimiento");
    // Trazabilidad de línea: con origen, una línea que no cita nada se rechaza (va en otra orden, o se agrega antes al requerimiento).
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, {
        supplier_id: supplierB, purchase_requisition_id: rid, number: "OC-Z1", order_date: "2026-09-17", currency: "PEN",
        items: [{ purchase_requisition_item_id: state.ri[2], description: "x", quantity_ordered: 1, line_total: 1 }, directLine({ description: "línea ajena al requerimiento" })] }),
        codeOf("PURCHASE_ORDER_LINK_REQUIRED"));
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, poBody({ number: "OC-Z2", items: [
        { quotation_item_id: state.qA.items[0].quotation_item_id, description: "x", quantity_ordered: 1, line_total: 1 }, directLine()] })),
        codeOf("PURCHASE_ORDER_LINK_REQUIRED"), "orden con cotización: toda línea cita la cotización");
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, poBody({ number: "OC-Z3", items: [
        { purchase_requisition_item_id: state.ri[0], description: "x", quantity_ordered: 1, line_total: 1 }] })),
        codeOf("PURCHASE_ORDER_LINK_REQUIRED"), "con cotización no basta citar solo el requerimiento");
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, {
        supplier_id: supplierA, number: "OC-Z4", order_date: "2026-09-17", currency: "PEN",
        items: [{ purchase_requisition_item_id: state.ri[0], description: "x", quantity_ordered: 1, line_total: 1 }] }),
        codeOf("PURCHASE_ORDER_LINK_INVALID"), "sin origen no se cita ninguna línea");
    // Citar una línea de cotización sin que la orden tenga cotización.
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, poBody({ number: "OC-X", quotation_id: null, purchase_requisition_id: rid, items: [
        { quotation_item_id: state.qA.items[0].quotation_item_id, description: "x", quantity_ordered: 1, line_total: 1 } ] })), codeOf("PURCHASE_ORDER_LINK_REQUIRED"), "solo requerimiento de origen: se cita la línea del requerimiento, no una de cotización");
});

test("crear: reglas de proyecto, proveedor, origen y producto; no queda nada a medias", async () => {
    const [{ n: before }] = await q(`SELECT COUNT(*)::int AS n FROM purchase_orders WHERE project_id = $1`, [projectId]);
    const line = (over = {}) => ({ quotation_item_id: state.qA.items[0].quotation_item_id, description: "x", quantity_ordered: 1, line_total: 1, ...over });
    const mk = (over) => poBody({ number: "OC-Y", items: [line()], ...over });
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, mk({ supplier_id: supplierB })), codeOf("PURCHASE_ORDER_SUPPLIER_MISMATCH"));
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, mk({ supplier_id: otherSupplier, quotation_id: null, items: [directLine()] })), codeOf("SUPPLIER_NOT_FOUND"));
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, mk({ quotation_id: 999999999 })), codeOf("QUOTATION_NOT_FOUND"));
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, mk({ quotation_id: null, purchase_requisition_id: 999999999, items: [directLine()] })), codeOf("PURCHASE_REQUISITION_NOT_FOUND"));
    const req2 = await rsvc.createPurchaseRequisitionService(owner(), { projectId }, reqBody({ number: "REQ-002" }));
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, mk({ purchase_requisition_id: req2.purchase_requisition_id })), codeOf("PURCHASE_ORDER_ORIGIN_MISMATCH"));
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, mk({ items: [line({ quotation_item_id: state.qB.items[0].quotation_item_id })] })), codeOf("PURCHASE_ORDER_LINK_INVALID"), "línea de OTRA cotización");
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, mk({ items: [line({ purchase_requisition_item_id: state.ri[1] })] })), codeOf("PURCHASE_ORDER_LINK_INVALID"), "requerimiento inconsistente con la cotización");
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, mk({ items: [line({ product_id: otherProductId })] })), codeOf("PURCHASE_ORDER_PRODUCT_MISMATCH"));
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, mk({ quotation_id: null, items: [{ description: "x", quantity_ordered: 1, line_total: 1 }] })), codeOf("PURCHASE_ORDER_PRODUCT_REQUIRED"));
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, mk({ quotation_id: null, items: [directLine({ product_id: otherProductId })] })), codeOf("PRODUCT_NOT_FOUND"));
    const [{ n: after }] = await q(`SELECT COUNT(*)::int AS n FROM purchase_orders WHERE project_id = $1`, [projectId]);
    assert.equal(after, before, "los fallidos no dejaron cabecera");
    state.req2 = req2;
});

test("el número lo pone la empresa: único por proyecto entre las activas, aunque sea de otro proveedor; la baja lo libera", async () => {
    await assert.rejects(psvc.createPurchaseOrderService(owner(), { projectId }, poBody({ supplier_id: supplierB, quotation_id: null, number: "OC-001", items: [directLine()] })), codeOf("PURCHASE_ORDER_DUPLICATE_NUMBER"));
    const ok = await psvc.createPurchaseOrderService(owner(), { projectId }, poBody({ supplier_id: supplierB, quotation_id: null, number: "OC-100", items: [directLine()] }));
    await psvc.deletePurchaseOrderService(owner(), oparams(ok.purchase_order_id));
    const reuse = await psvc.createPurchaseOrderService(owner(), { projectId }, poBody({ supplier_id: supplierB, quotation_id: null, number: "OC-100", items: [directLine()] }));
    assert.equal(reuse.number, "OC-100");
    state.po100 = reuse;
});

test("listar y filtrar por proveedor, cotización y texto; el detalle respeta el proyecto", async () => {
    const list = (query) => psvc.listPurchaseOrdersService(asUser(plainId), { projectId }, query);
    assert.equal((await list({})).length, 6);
    assert.equal((await list({ supplier_id: supplierB })).length, 3);
    assert.equal((await list({ quotation_id: state.qA.quotation_id })).length, 2);
    assert.equal((await list({ search: "ferret" })).length, 3, "por nombre del proveedor");
    assert.equal((await list({ search: "OC-003" })).length, 1);
    assert.equal((await list({ search: "%" })).length, 0);
    const one = (await list({ search: "OC-001" }))[0];
    assert.equal(one.items_count, 1);
    assert.equal(one.has_file, false);
    await assert.rejects(psvc.getPurchaseOrderByIdService(owner(), { projectId: otherProjectId, purchaseOrderId: state.po1.purchase_order_id }), codeOf("PURCHASE_ORDER_NOT_FOUND"));
});

test("PATCH cabecera: solo lo enviado; null limpia el total; el número repetido se rechaza", async () => {
    const id = state.po1.purchase_order_id;
    const a = await psvc.updatePurchaseOrderService(asUser(editorId), oparams(id), { currency: "USD", commercial_terms: "Entrega en obra" });
    assert.equal(a.currency, "USD");
    assert.equal(a.commercial_terms, "Entrega en obra");
    assert.equal(a.number, "OC-001", "lo no enviado no se toca");
    assert.equal(a.updated_by, editorId);
    assert.equal(a.quotation.number, "COT-A", "el origen no cambia");
    const b = await psvc.updatePurchaseOrderService(asUser(editorId), oparams(id), { total_amount: null, currency: "PEN" });
    assert.equal(b.total_amount, null);
    assert.equal(b.lines_total, "1860.000000");
    await assert.rejects(psvc.updatePurchaseOrderService(asUser(editorId), oparams(id), { number: "OC-002" }), codeOf("PURCHASE_ORDER_DUPLICATE_NUMBER"));
    await assert.rejects(psvc.updatePurchaseOrderService(asUser(editorId), oparams(999999999), { number: "Z" }), codeOf("PURCHASE_ORDER_NOT_FOUND"));
});

test("líneas: agregar (citando el origen), PATCH parcial, quitar; ids estables; la última no se quita", async () => {
    const id = state.po1.purchase_order_id;
    const added = await psvc.addPurchaseOrderItemService(asUser(editorId), oparams(id), { quotation_item_id: state.qA.items[1].quotation_item_id, description: "Cemento columnas", quantity_ordered: 40, line_total: 1200 });
    assert.equal(added.items.length, 2);
    const ids = added.items.map((i) => i.purchase_order_item_id);

    // Con origen, una línea sin vínculo (o con otro vínculo) se rechaza también al agregarla.
    await assert.rejects(psvc.addPurchaseOrderItemService(asUser(editorId), oparams(id), directLine({ description: "Flete" })), codeOf("PURCHASE_ORDER_LINK_REQUIRED"));
    await assert.rejects(psvc.addPurchaseOrderItemService(asUser(editorId), oparams(id), { purchase_requisition_item_id: state.ri[0], description: "x", quantity_ordered: 1, line_total: 1 }), codeOf("PURCHASE_ORDER_LINK_REQUIRED"));
    await assert.rejects(psvc.addPurchaseOrderItemService(asUser(editorId), oparams(id), { quotation_item_id: state.qB.items[0].quotation_item_id, description: "x", quantity_ordered: 1, line_total: 1 }), codeOf("PURCHASE_ORDER_LINK_INVALID"), "línea de otra cotización");

    const patched = await psvc.updatePurchaseOrderItemService(asUser(editorId), oparams(id, { itemId: state.po1Item }), { line_total: 1900, unit_price: null });
    const a = patched.items.find((i) => i.purchase_order_item_id === state.po1Item);
    assert.equal(a.line_total, "1900.000000");
    assert.equal(a.unit_price, null);
    assert.equal(a.description, "Cemento Sol (según orden)", "lo no enviado no se toca");
    assert.deepEqual(patched.items.map((i) => i.purchase_order_item_id), ids, "ids estables");
    await assert.rejects(psvc.updatePurchaseOrderItemService(asUser(editorId), oparams(id, { itemId: 999999999 }), { line_total: 1 }), codeOf("PURCHASE_ORDER_ITEM_NOT_FOUND"));
    await assert.rejects(psvc.updatePurchaseOrderItemService(asUser(editorId), oparams(state.po2.purchase_order_id, { itemId: state.po1Item }), { line_total: 1 }), codeOf("PURCHASE_ORDER_ITEM_NOT_FOUND"), "línea de otra orden");

    // En una compra directa (sin origen) sí se agregan líneas con su producto.
    const direct = await psvc.addPurchaseOrderItemService(asUser(editorId), oparams(state.po4.purchase_order_id), directLine({ description: "Otra línea directa" }));
    assert.equal(direct.items.length, 2);
    await assert.rejects(psvc.addPurchaseOrderItemService(asUser(editorId), oparams(state.po4.purchase_order_id), { quotation_item_id: state.qA.items[0].quotation_item_id, description: "x", quantity_ordered: 1, line_total: 1 }), codeOf("PURCHASE_ORDER_LINK_INVALID"));

    await psvc.deletePurchaseOrderItemService(asUser(editorId), oparams(id, { itemId: ids[1] }));
    await assert.rejects(psvc.deletePurchaseOrderItemService(asUser(editorId), oparams(id, { itemId: ids[0] })), codeOf("PURCHASE_ORDER_LAST_ITEM"));
});

test("snapshot y candados: la orden no cambia si se corrige la cotización, y lo ya ordenado no se altera ni se quita", async () => {
    const qid = state.qA.quotation_id;
    const qitem = state.qA.items[0].quotation_item_id;
    const qparams = (extra = {}) => ({ projectId, quotationId: qid, ...extra });
    // Descripción/observaciones: libres. La orden conserva su propia copia.
    await qsvc.updateQuotationItemService(asUser(editorId), qparams({ itemId: qitem }), { description: "Texto corregido en la cotización", notes: "nota" });
    assert.equal((await psvc.getPurchaseOrderByIdService(owner(), oparams(state.po1.purchase_order_id))).items[0].description, "Cemento Sol (según orden)");
    // Cantidad y montos: bloqueados por la orden activa.
    for (const field of [{ quantity_quoted: 5 }, { unit_price: 1 }, { discount_amount: 1 }, { tax_amount: 1 }, { line_total: 1 }]) {
        await assert.rejects(qsvc.updateQuotationItemService(asUser(editorId), qparams({ itemId: qitem }), field), codeOf("QUOTATION_ITEM_LOCKED"), JSON.stringify(field));
    }
    await assert.rejects(qsvc.deleteQuotationItemService(asUser(editorId), qparams({ itemId: qitem })), codeOf("QUOTATION_ITEM_LOCKED"));
    await assert.rejects(qsvc.deleteQuotationService(owner(), qparams()), codeOf("QUOTATION_HAS_DOCUMENTS"));
    // Requerimiento: línea citada (directa y por cotización) y baja del requerimiento.
    const rparams = (extra = {}) => ({ projectId, purchaseRequisitionId: state.req.purchase_requisition_id, ...extra });
    await assert.rejects(rsvc.deletePurchaseRequisitionService(owner(), rparams()), codeOf("PURCHASE_REQUISITION_HAS_DOCUMENTS"));
    await assert.rejects(rsvc.updatePurchaseRequisitionItemService(asUser(editorId), rparams({ itemId: state.ri[2] }), { quantity_requested: 9 }), codeOf("PURCHASE_REQUISITION_ITEM_LOCKED"), "citada directamente por la OC-005");
    await assert.rejects(rsvc.deletePurchaseRequisitionItemService(asUser(editorId), rparams({ itemId: state.ri[2] })), codeOf("PURCHASE_REQUISITION_ITEM_LOCKED"));
});

test("un requerimiento sin cotizaciones pero con una orden que lo cita tampoco se da de baja; al dar de baja la orden, sí", async () => {
    const rid2 = state.req2.purchase_requisition_id;
    const direct = await psvc.createPurchaseOrderService(owner(), { projectId }, {
        supplier_id: supplierA, purchase_requisition_id: rid2, number: "OC-REQ2", order_date: "2026-09-18", currency: "PEN",
        items: [{ purchase_requisition_item_id: state.req2.items[0].purchase_requisition_item_id, description: "x", quantity_ordered: 1, line_total: 1 }] });
    await assert.rejects(rsvc.deletePurchaseRequisitionService(owner(), { projectId, purchaseRequisitionId: rid2 }), codeOf("PURCHASE_REQUISITION_HAS_DOCUMENTS"));
    await psvc.deletePurchaseOrderService(owner(), oparams(direct.purchase_order_id));
    await rsvc.deletePurchaseRequisitionService(owner(), { projectId, purchaseRequisitionId: rid2 });
});

test("proveedor: documents_count suma las órdenes activas; el RUC se bloquea; una orden dada de baja ya no lo ata", async () => {
    const ssvc = await import("../dist/services/almacen/supplier.service.js");
    // supplierB: 1 cotización (COT-B) + OC-003 + OC-005 + OC-100 = 4
    assert.equal((await ssvc.getSupplierByIdService(owner(), { projectId, supplierId: supplierB })).documents_count, 4);
    await assert.rejects(ssvc.deleteSupplierService(owner(), { projectId, supplierId: supplierB }), codeOf("SUPPLIER_HAS_DOCUMENTS"));
    await assert.rejects(ssvc.updateSupplierService(owner(), { projectId, supplierId: supplierB }, { ruc: "20111111111", name: "x" }), codeOf("SUPPLIER_RUC_LOCKED"));
    await psvc.deletePurchaseOrderService(owner(), oparams(state.po100.purchase_order_id));
    assert.equal((await ssvc.getSupplierByIdService(owner(), { projectId, supplierId: supplierB })).documents_count, 3);
});

test("un proveedor cuyo único documento es una orden: cuenta 1, RUC bloqueado, baja rechazada; sin la orden activa queda libre", async () => {
    const ssvc = await import("../dist/services/almacen/supplier.service.js");
    const supplierC = (await ssvc.createSupplierService(owner(), { projectId }, { ruc: "20444444444", name: "Solo con una orden" })).supplier_id;
    const po = await psvc.createPurchaseOrderService(owner(), { projectId }, {
        supplier_id: supplierC, number: "OC-C", order_date: "2026-09-18", currency: "PEN", items: [directLine()] });
    assert.equal((await ssvc.getSupplierByIdService(owner(), { projectId, supplierId: supplierC })).documents_count, 1);
    await assert.rejects(ssvc.updateSupplierService(owner(), { projectId, supplierId: supplierC }, { ruc: "20555555550", name: "x" }), codeOf("SUPPLIER_RUC_LOCKED"));
    await assert.rejects(ssvc.deleteSupplierService(owner(), { projectId, supplierId: supplierC }), codeOf("SUPPLIER_HAS_DOCUMENTS"));
    await psvc.deletePurchaseOrderService(owner(), oparams(po.purchase_order_id));
    await ssvc.deleteSupplierService(owner(), { projectId, supplierId: supplierC });
});

test("archivo: adjuntar, reemplazar y quitar elimina el anterior; no compartir con otro documento; DELETE /files se rechaza", async () => {
    const id = state.po1.purchase_order_id;
    const f1 = await makeFile(projectId);
    const withFile = await psvc.setPurchaseOrderFileService(asUser(editorId), oparams(id), { file_id: f1.fileId });
    assert.equal(withFile.file.file_id, f1.fileId);
    assert.match(withFile.file.url, /^\/files\/\d+\/content\?token=/);
    assert.equal((await psvc.listPurchaseOrdersService(asUser(plainId), { projectId }, { search: "OC-001" }))[0].has_file, true);
    await assert.rejects(deleteFileService(owner(), { projectId, fileId: f1.fileId }), codeOf("FILE_IN_USE"));

    // El archivo de una cotización no se puede adjuntar a una orden (tablas distintas).
    const qFile = await makeFile(projectId);
    await qsvc.setQuotationFileService(asUser(editorId), { projectId, quotationId: state.qB.quotation_id }, { file_id: qFile.fileId });
    await assert.rejects(psvc.setPurchaseOrderFileService(asUser(editorId), oparams(state.po2.purchase_order_id), { file_id: qFile.fileId }), codeOf("DOCUMENT_FILE_ALREADY_ATTACHED"));
    for (const f of [await makeFile(otherProjectId), await makeFile(projectId, "metrados")]) {
        state.leftovers = [...(state.leftovers ?? []), f.fileId];
        await assert.rejects(psvc.setPurchaseOrderFileService(asUser(editorId), oparams(id), { file_id: f.fileId }), codeOf("DOCUMENT_FILE_NOT_FOUND"));
    }
    // Y al revés: el archivo de una orden no se puede adjuntar a una cotización ni a un requerimiento.
    await assert.rejects(qsvc.setQuotationFileService(asUser(editorId), { projectId, quotationId: state.qA.quotation_id }, { file_id: f1.fileId }), codeOf("DOCUMENT_FILE_ALREADY_ATTACHED"));
    await assert.rejects(rsvc.setPurchaseRequisitionFileService(asUser(editorId), { projectId, purchaseRequisitionId: state.req.purchase_requisition_id }, { file_id: f1.fileId }), codeOf("DOCUMENT_FILE_ALREADY_ATTACHED"));
    const f2 = await makeFile(projectId);
    await psvc.setPurchaseOrderFileService(asUser(editorId), oparams(id), { file_id: f2.fileId });
    assert.equal(await fileRowExists(f1.fileId), false);
    assert.equal(fs.existsSync(f1.filePath), false, "los bytes anteriores se eliminaron");
    state.f2 = f2;
});

test("permisos: solo ver lee pero no escribe; el Editor crea y edita pero no da de baja; ajeno al proyecto no ve nada", async () => {
    const id = state.po1.purchase_order_id;
    assert.equal((await psvc.getPurchaseOrderByIdService(asUser(plainId), oparams(id))).number, "OC-001");
    await assert.rejects(psvc.createPurchaseOrderService(asUser(plainId), { projectId }, poBody({ number: "P-1" })), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(psvc.updatePurchaseOrderService(asUser(plainId), oparams(id), { number: "P" }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(psvc.setPurchaseOrderFileService(asUser(plainId), oparams(id), { file_id: null }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(psvc.listPurchaseOrdersService(asUser(outsiderId), { projectId }, {}), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    await assert.rejects(psvc.deletePurchaseOrderService(asUser(editorId), oparams(id)), codeOf("INSUFFICIENT_PERMISSIONS"));
    assert.equal(await fileRowExists(state.f2.fileId), true, "el intento rechazado no borra nada");
});

test("baja: elimina el archivo, libera el número y libera el candado de cantidad; la línea ya citada se conserva", async () => {
    const id = state.po1.purchase_order_id;
    await psvc.deletePurchaseOrderService(owner(), oparams(id));
    assert.equal(await fileRowExists(state.f2.fileId), false, "la baja elimina el archivo físico");
    assert.equal(fs.existsSync(state.f2.filePath), false);
    await assert.rejects(psvc.getPurchaseOrderByIdService(owner(), oparams(id)), codeOf("PURCHASE_ORDER_NOT_FOUND"));
    await assert.rejects(psvc.deletePurchaseOrderService(owner(), oparams(id)), codeOf("PURCHASE_ORDER_NOT_FOUND"));
    await assert.rejects(psvc.addPurchaseOrderItemService(asUser(editorId), oparams(id), directLine()), codeOf("PURCHASE_ORDER_NOT_FOUND"));
    const [row] = await q(`SELECT deleted_at, file_id FROM purchase_orders WHERE purchase_order_id = $1`, [id]);
    assert.ok(row.deleted_at);
    assert.equal(row.file_id, null);
    const again = await psvc.createPurchaseOrderService(owner(), { projectId }, poBody({ items: [directLine()], quotation_id: null }));
    assert.equal(again.number, "OC-001", "el número quedó libre");

    // OC-002 sigue activa sobre la línea 0 de la cotización A: sigue bloqueada. Se da de baja también y se libera.
    const qparams = (extra = {}) => ({ projectId, quotationId: state.qA.quotation_id, ...extra });
    await psvc.deletePurchaseOrderService(owner(), oparams(state.po2.purchase_order_id));
    const edited = await qsvc.updateQuotationItemService(asUser(editorId), qparams({ itemId: state.qA.items[0].quotation_item_id }), { quantity_quoted: 90 });
    assert.equal(edited.items[0].quantity_quoted, "90.000000", "sin órdenes activas la cantidad se puede editar");
    await assert.rejects(qsvc.deleteQuotationItemService(asUser(editorId), qparams({ itemId: state.qA.items[0].quotation_item_id })), codeOf("QUOTATION_ITEM_LOCKED"), "la FK conserva la línea citada por órdenes dadas de baja");
});

test("vaciar Almacén: elimina órdenes (incluidas las dadas de baja), cotizaciones, requerimientos y proveedores", async () => {
    const counts = await emptyAlmacenContentService(owner(), { projectId });
    assert.ok(counts.purchase_orders >= 6, "incluidas las dadas de baja");
    assert.ok(counts.quotations >= 2);
    assert.equal(counts.suppliers, 3, "incluido el proveedor dado de baja");
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM purchase_order_items WHERE purchase_order_id IN (SELECT purchase_order_id FROM purchase_orders WHERE project_id = $1)`, [projectId]);
    assert.equal(n, 0);
    await pool.query(`DELETE FROM files WHERE file_id = ANY($1::bigint[])`, [state.leftovers ?? []]);
});
