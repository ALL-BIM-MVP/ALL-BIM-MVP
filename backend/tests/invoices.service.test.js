// invoices.service.test.js
//
// Test de integración (BD real) de la Fase 6 de
// docs/almacen-ingreso-productos/05-roadmap.md: facturas con orden de origen
// opcional (si existe, cada línea cita la línea de la orden), serie y número
// únicos por proveedor, facturación parcial, candados sobre la orden, archivo y
// permisos. Corre contra dist/ ya compilado, sin mocks del driver.
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
const schemas = await import("../dist/schemas/almacen/invoice.schema.js");
const psvc = await import("../dist/services/almacen/purchase-order.service.js");
const isvc = await import("../dist/services/almacen/invoice.service.js");

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
const iparams = (id, extra = {}) => ({ projectId, invoiceId: id, ...extra });
const oparams = (id, extra = {}) => ({ projectId, purchaseOrderId: id, ...extra });
const directPo = (supplier, number, lines) => psvc.createPurchaseOrderService(owner(), { projectId }, {
    supplier_id: supplier, number, order_date: "2026-09-15", currency: "PEN",
    items: lines.map(([qty, total]) => ({ product_id: productId, description: "Cemento (orden)", quantity_ordered: qty, line_total: total })),
});
const invBody = (overrides = {}) => ({
    supplier_id: supplierA, purchase_order_id: state.poA?.purchase_order_id, series: "F001", number: "123",
    invoice_date: "2026-09-20", currency: "PEN", subtotal_amount: 1525.42, tax_amount: 274.58, total_amount: 1800,
    items: [{ purchase_order_item_id: state.poA?.items[0].purchase_order_item_id, description: "Cemento Sol (según factura)", quantity_invoiced: 60, unit_price: 30, line_total: 1800 }],
    ...overrides,
});
const invDirect = (over = {}) => ({
    supplier_id: supplierA, series: "F001", number: "900", invoice_date: "2026-09-20", currency: "PEN",
    items: [{ product_id: productId, description: "Factura directa", quantity_invoiced: 5, line_total: 50 }], ...over,
});

test("Zod: serie y número (formato SUNAT), moneda cerrada, total de línea obligatorio, origen y montos opcionales", () => {
    const { CreateInvoiceBodySchema: Create, UpdateInvoiceBodySchema: Patch, UpdateInvoiceItemBodySchema: PatchItem,
        SetInvoiceFileBodySchema: SetFile, ListInvoicesQuerySchema: List } = schemas;
    const ok = { supplier_id: 1, series: "F001", number: "123", invoice_date: "2026-09-20", currency: "PEN",
        items: [{ product_id: 1, description: "x", quantity_invoiced: 1, line_total: 10 }] };
    assert.equal(Create.safeParse(ok).success, true, "factura sin orden ni montos de cabecera");
    assert.equal(Create.parse({ ...ok, series: " f001 " }).series, "F001", "la serie se pasa a mayúsculas");
    assert.equal(Create.safeParse({ ...ok, purchase_order_id: 3, items: [{ purchase_order_item_id: 5, description: "x", quantity_invoiced: 1, line_total: 1 }] }).success, true);
    for (const [series, number] of [["F-001", "123"], ["FA001", "123"], ["", "123"], ["F001", "123456789"], ["F001", "12a"], ["F001", ""], ["GR 1", "1"]]) {
        assert.equal(Create.safeParse({ ...ok, series, number }).success, false, `serie/número inválidos: "${series}" / "${number}"`);
    }
    for (const bad of ["EUR", "pen", "", undefined]) assert.equal(Create.safeParse({ ...ok, currency: bad }).success, false, `moneda ${String(bad)}`);
    assert.equal(Create.safeParse({ ...ok, items: [] }).success, false);
    assert.equal(Create.safeParse({ ...ok, invoice_date: "20/09/2026" }).success, false);
    assert.equal(Create.safeParse({ ...ok, total_amount: -1 }).success, false);
    assert.equal(Create.safeParse({ ...ok, subtotal_amount: null, tax_amount: null, total_amount: null }).success, true);
    const line = ok.items[0];
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, line_total: undefined }] }).success, false, "line_total obligatorio");
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, unit_price: null, discount_amount: null, tax_amount: null }] }).success, true, "solo total");
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, quantity_invoiced: 0 }] }).success, false);
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, line_total: 1e15 }] }).success, false);
    assert.equal(Patch.safeParse({}).success, false);
    assert.equal(Patch.safeParse({ total_amount: null, tax_amount: null }).success, true);
    assert.equal(Patch.safeParse({ supplier_id: 2 }).success, false, "el proveedor no se cambia por PATCH");
    assert.equal(Patch.safeParse({ series: "F-1" }).success, false);
    assert.equal(PatchItem.safeParse({ unit_price: null }).success, true);
    assert.equal(PatchItem.safeParse({ product_id: 2 }).success, false, "el producto no se cambia por PATCH");
    assert.equal(SetFile.safeParse({}).success, false);
    assert.equal(List.safeParse({ purchase_order_id: "x" }).success, false);
});

test("preparar: dos órdenes de compra (un proveedor cada una)", async () => {
    state.poA = await directPo(supplierA, "OC-A", [[100, 3000], [40, 1200]]);
    state.poB = await directPo(supplierB, "OC-B", [[100, 2800]]);
    assert.equal(state.poA.items.length, 2);
});

test("crear desde una orden, solo algunas líneas y con su propia copia: se deduce el producto; totales del documento", async () => {
    const inv = await isvc.createInvoiceService(owner(), { projectId }, invBody());
    state.inv1 = inv;
    assert.equal(inv.series, "F001");
    assert.equal(inv.number, "123");
    assert.equal(inv.invoice_date, "2026-09-20");
    assert.equal(inv.currency, "PEN");
    assert.equal(inv.supplier.ruc, "20123456789");
    assert.equal(inv.purchase_order.number, "OC-A");
    assert.equal(inv.subtotal_amount, "1525.420000");
    assert.equal(inv.tax_amount, "274.580000");
    assert.equal(inv.total_amount, "1800.000000");
    assert.equal(inv.lines_total, "1800.000000");
    assert.equal(inv.items.length, 1, "solo una de las 2 líneas de la orden");
    const line = inv.items[0];
    assert.equal(line.quantity_invoiced, "60.000000", "cantidad propia (la orden decía 100)");
    assert.equal(line.purchase_order_item.quantity_ordered, "100.000000");
    assert.equal(line.purchase_order_item.description, "Cemento (orden)");
    assert.equal(String(line.product.product_id), String(productId), "producto deducido de la línea de la orden");
    assert.equal(inv.file, null);
    state.inv1Item = line.invoice_item_id;
});

test("facturación parcial: la misma línea de orden en dos facturas; otro proveedor; y una factura sin orden", async () => {
    const second = await isvc.createInvoiceService(owner(), { projectId }, invBody({ number: "124", total_amount: null, items: [
        { purchase_order_item_id: state.poA.items[0].purchase_order_item_id, description: "Cemento (saldo)", quantity_invoiced: 40, line_total: 1200 } ] }));
    state.inv2 = second;
    const fromB = await isvc.createInvoiceService(owner(), { projectId }, invBody({
        supplier_id: supplierB, purchase_order_id: state.poB.purchase_order_id, series: "F001", number: "123", currency: "USD", total_amount: null,
        items: [{ purchase_order_item_id: state.poB.items[0].purchase_order_item_id, description: "Cemento Andino", quantity_invoiced: 100, line_total: 2800 }] }));
    state.inv3 = fromB;
    assert.equal(fromB.currency, "USD");
    assert.equal(fromB.total_amount, null);
    const direct = await isvc.createInvoiceService(owner(), { projectId }, invDirect());
    state.inv4 = direct;
    assert.equal(direct.purchase_order, null, "factura sin orden");
    assert.equal(direct.items[0].purchase_order_item, null);
    const byOrder = await isvc.listInvoicesService(asUser(plainId), { projectId }, { purchase_order_id: state.poA.purchase_order_id });
    assert.equal(byOrder.length, 2, "2 facturas de la misma orden");
});

test("crear: con orden cada línea la cita; reglas de proyecto, proveedor y producto; no queda nada a medias", async () => {
    const [{ n: before }] = await q(`SELECT COUNT(*)::int AS n FROM invoices WHERE project_id = $1`, [projectId]);
    const line = (over = {}) => ({ purchase_order_item_id: state.poA.items[0].purchase_order_item_id, description: "x", quantity_invoiced: 1, line_total: 1, ...over });
    const mk = (over) => invBody({ number: "777", items: [line()], ...over });
    // Trazabilidad de línea: con orden, una línea que no cita nada se rechaza.
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, mk({ items: [line(), { product_id: productId, description: "ajena", quantity_invoiced: 1, line_total: 1 }] })), codeOf("INVOICE_LINK_REQUIRED"));
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, mk({ supplier_id: supplierB })), codeOf("INVOICE_SUPPLIER_MISMATCH"));
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, mk({ purchase_order_id: 999999999 })), codeOf("PURCHASE_ORDER_NOT_FOUND"));
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, mk({ items: [line({ purchase_order_item_id: state.poB.items[0].purchase_order_item_id })] })), codeOf("INVOICE_LINK_INVALID"), "línea de OTRA orden");
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, mk({ items: [line({ product_id: otherProductId })] })), codeOf("INVOICE_PRODUCT_MISMATCH"));
    // Sin orden: no se citan líneas y el producto es obligatorio.
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, invDirect({ number: "778", items: [line()] })), codeOf("INVOICE_LINK_INVALID"));
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, invDirect({ number: "779", items: [{ description: "x", quantity_invoiced: 1, line_total: 1 }] })), codeOf("INVOICE_PRODUCT_REQUIRED"));
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, invDirect({ number: "780", items: [{ product_id: otherProductId, description: "x", quantity_invoiced: 1, line_total: 1 }] })), codeOf("PRODUCT_NOT_FOUND"));
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, invDirect({ number: "781", supplier_id: otherSupplier })), codeOf("SUPPLIER_NOT_FOUND"));
    const [{ n: after }] = await q(`SELECT COUNT(*)::int AS n FROM invoices WHERE project_id = $1`, [projectId]);
    assert.equal(after, before, "los fallidos no dejaron cabecera");
});

test("la misma factura no se registra dos veces (proveedor + serie + número); la serie va en mayúsculas; otro proveedor sí; la baja libera", async () => {
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, invBody({ series: "F001", number: "123" })), codeOf("INVOICE_DUPLICATE"));
    // El motor exige mayúsculas: una serie en minúsculas no entra sin normalizar (Zod la normaliza en la API).
    await assert.rejects(isvc.createInvoiceService(owner(), { projectId }, invBody({ series: "f001", number: "555" })), (e) => e?.code === "23514", "CHECK de mayúsculas");
    assert.equal(state.inv3.number, "123", "el proveedor B ya registró F001-123: permitido porque es otro proveedor");
    const other = await isvc.createInvoiceService(owner(), { projectId }, invDirect({ number: "901" }));
    await isvc.deleteInvoiceService(owner(), iparams(other.invoice_id));
    const reuse = await isvc.createInvoiceService(owner(), { projectId }, invDirect({ number: "901" }));
    assert.equal(reuse.number, "901");
    state.inv901 = reuse;
});

test("listar y filtrar por proveedor, orden y texto (serie-número o proveedor); el detalle respeta el proyecto", async () => {
    const list = (query) => isvc.listInvoicesService(asUser(plainId), { projectId }, query);
    assert.equal((await list({})).length, 5);
    assert.equal((await list({ supplier_id: supplierB })).length, 1);
    assert.equal((await list({ purchase_order_id: state.poB.purchase_order_id })).length, 1);
    assert.equal((await list({ search: "F001-123" })).length, 2, "serie-número en dos proveedores");
    assert.equal((await list({ search: "ferret" })).length, 1, "por nombre del proveedor");
    assert.equal((await list({ search: "%" })).length, 0);
    const one = (await list({ search: "F001-124" }))[0];
    assert.equal(one.items_count, 1);
    assert.equal(one.has_file, false);
    await assert.rejects(isvc.getInvoiceByIdService(owner(), { projectId: otherProjectId, invoiceId: state.inv1.invoice_id }), codeOf("INVOICE_NOT_FOUND"));
});

test("PATCH cabecera: solo lo enviado; serie normalizada; null limpia montos; el duplicado se rechaza", async () => {
    const id = state.inv1.invoice_id;
    const a = await isvc.updateInvoiceService(asUser(editorId), iparams(id), { currency: "USD", invoice_date: "2026-09-21" });
    assert.equal(a.currency, "USD");
    assert.equal(a.invoice_date, "2026-09-21");
    assert.equal(a.number, "123", "lo no enviado no se toca");
    assert.equal(a.updated_by, editorId);
    assert.equal(a.purchase_order.number, "OC-A", "el origen no cambia");
    const b = await isvc.updateInvoiceService(asUser(editorId), iparams(id), { total_amount: null, subtotal_amount: null, tax_amount: null, currency: "PEN" });
    assert.equal(b.total_amount, null);
    assert.equal(b.lines_total, "1800.000000");
    await assert.rejects(isvc.updateInvoiceService(asUser(editorId), iparams(id), { number: "124" }), codeOf("INVOICE_DUPLICATE"));
    assert.equal((await isvc.updateInvoiceService(asUser(editorId), iparams(id), { series: "E001" })).series, "E001");
    await isvc.updateInvoiceService(asUser(editorId), iparams(id), { series: "F001" });
    await assert.rejects(isvc.updateInvoiceService(asUser(editorId), iparams(999999999), { number: "9" }), codeOf("INVOICE_NOT_FOUND"));
});

test("líneas: agregar (citando la orden), PATCH parcial, quitar; ids estables; la última no se quita", async () => {
    const id = state.inv1.invoice_id;
    const added = await isvc.addInvoiceItemService(asUser(editorId), iparams(id), { purchase_order_item_id: state.poA.items[1].purchase_order_item_id, description: "Cemento columnas", quantity_invoiced: 40, line_total: 1200 });
    assert.equal(added.items.length, 2);
    const ids = added.items.map((i) => i.invoice_item_id);
    await assert.rejects(isvc.addInvoiceItemService(asUser(editorId), iparams(id), { product_id: productId, description: "Flete", quantity_invoiced: 1, line_total: 80 }), codeOf("INVOICE_LINK_REQUIRED"));
    await assert.rejects(isvc.addInvoiceItemService(asUser(editorId), iparams(id), { purchase_order_item_id: state.poB.items[0].purchase_order_item_id, description: "x", quantity_invoiced: 1, line_total: 1 }), codeOf("INVOICE_LINK_INVALID"));

    const patched = await isvc.updateInvoiceItemService(asUser(editorId), iparams(id, { itemId: state.inv1Item }), { line_total: 1900, unit_price: null });
    const a = patched.items.find((i) => i.invoice_item_id === state.inv1Item);
    assert.equal(a.line_total, "1900.000000");
    assert.equal(a.unit_price, null);
    assert.equal(a.description, "Cemento Sol (según factura)", "lo no enviado no se toca");
    assert.deepEqual(patched.items.map((i) => i.invoice_item_id), ids, "ids estables");
    await assert.rejects(isvc.updateInvoiceItemService(asUser(editorId), iparams(id, { itemId: 999999999 }), { line_total: 1 }), codeOf("INVOICE_ITEM_NOT_FOUND"));
    await assert.rejects(isvc.updateInvoiceItemService(asUser(editorId), iparams(state.inv2.invoice_id, { itemId: state.inv1Item }), { line_total: 1 }), codeOf("INVOICE_ITEM_NOT_FOUND"), "línea de otra factura");

    // En una factura sin orden sí se agregan líneas con su producto; citar una línea de orden no.
    assert.equal((await isvc.addInvoiceItemService(asUser(editorId), iparams(state.inv4.invoice_id), { product_id: productId, description: "Otra", quantity_invoiced: 1, line_total: 1 })).items.length, 2);
    await assert.rejects(isvc.addInvoiceItemService(asUser(editorId), iparams(state.inv4.invoice_id), { purchase_order_item_id: state.poA.items[0].purchase_order_item_id, description: "x", quantity_invoiced: 1, line_total: 1 }), codeOf("INVOICE_LINK_INVALID"));

    await isvc.deleteInvoiceItemService(asUser(editorId), iparams(id, { itemId: ids[1] }));
    await assert.rejects(isvc.deleteInvoiceItemService(asUser(editorId), iparams(id, { itemId: ids[0] })), codeOf("INVOICE_LAST_ITEM"));
});

test("candados sobre la orden: lo ya facturado no se altera ni se quita; la orden con facturas no se da de baja", async () => {
    const oid = state.poA.purchase_order_id;
    const line0 = state.poA.items[0].purchase_order_item_id;
    // Descripción y observaciones: libres. La factura conserva su propia copia.
    await psvc.updatePurchaseOrderItemService(asUser(editorId), oparams(oid, { itemId: line0 }), { description: "Texto corregido en la orden", notes: "nota" });
    assert.equal((await isvc.getInvoiceByIdService(owner(), iparams(state.inv1.invoice_id))).items[0].description, "Cemento Sol (según factura)");
    // Cantidad y montos: bloqueados por la factura activa.
    for (const field of [{ quantity_ordered: 5 }, { unit_price: 1 }, { discount_amount: 1 }, { tax_amount: 1 }, { line_total: 1 }]) {
        await assert.rejects(psvc.updatePurchaseOrderItemService(asUser(editorId), oparams(oid, { itemId: line0 }), field), codeOf("PURCHASE_ORDER_ITEM_LOCKED"), JSON.stringify(field));
    }
    await assert.rejects(psvc.deletePurchaseOrderItemService(asUser(editorId), oparams(oid, { itemId: line0 })), codeOf("PURCHASE_ORDER_ITEM_LOCKED"));
    await assert.rejects(psvc.deletePurchaseOrderService(owner(), oparams(oid)), codeOf("PURCHASE_ORDER_HAS_DOCUMENTS"));
});

test("proveedor: documents_count suma facturas; uno cuyo único documento es una factura queda bloqueado; dada de baja ya no lo ata", async () => {
    const ssvc = await import("../dist/services/almacen/supplier.service.js");
    const supplierC = (await ssvc.createSupplierService(owner(), { projectId }, { ruc: "20444444444", name: "Solo con una factura" })).supplier_id;
    const inv = await isvc.createInvoiceService(owner(), { projectId }, invDirect({ supplier_id: supplierC, number: "1" }));
    assert.equal((await ssvc.getSupplierByIdService(owner(), { projectId, supplierId: supplierC })).documents_count, 1);
    await assert.rejects(ssvc.updateSupplierService(owner(), { projectId, supplierId: supplierC }, { ruc: "20555555550", name: "x" }), codeOf("SUPPLIER_RUC_LOCKED"));
    await assert.rejects(ssvc.deleteSupplierService(owner(), { projectId, supplierId: supplierC }), codeOf("SUPPLIER_HAS_DOCUMENTS"));
    await isvc.deleteInvoiceService(owner(), iparams(inv.invoice_id));
    await ssvc.deleteSupplierService(owner(), { projectId, supplierId: supplierC });
});

test("archivo: adjuntar, reemplazar y quitar elimina el anterior; no compartir con otro documento; DELETE /files se rechaza", async () => {
    const id = state.inv1.invoice_id;
    const f1 = await makeFile(projectId);
    const withFile = await isvc.setInvoiceFileService(asUser(editorId), iparams(id), { file_id: f1.fileId });
    assert.equal(withFile.file.file_id, f1.fileId);
    assert.match(withFile.file.url, /^\/files\/\d+\/content\?token=/);
    assert.equal((await isvc.listInvoicesService(asUser(plainId), { projectId }, { search: "F001-123" })).some((i) => i.has_file), true);
    await assert.rejects(deleteFileService(owner(), { projectId, fileId: f1.fileId }), codeOf("FILE_IN_USE"));

    // El archivo de una orden no se puede adjuntar a una factura, ni al revés.
    const oFile = await makeFile(projectId);
    await psvc.setPurchaseOrderFileService(asUser(editorId), oparams(state.poB.purchase_order_id), { file_id: oFile.fileId });
    await assert.rejects(isvc.setInvoiceFileService(asUser(editorId), iparams(state.inv2.invoice_id), { file_id: oFile.fileId }), codeOf("DOCUMENT_FILE_ALREADY_ATTACHED"));
    await assert.rejects(psvc.setPurchaseOrderFileService(asUser(editorId), oparams(state.poA.purchase_order_id), { file_id: f1.fileId }), codeOf("DOCUMENT_FILE_ALREADY_ATTACHED"));
    for (const f of [await makeFile(otherProjectId), await makeFile(projectId, "metrados")]) {
        state.leftovers = [...(state.leftovers ?? []), f.fileId];
        await assert.rejects(isvc.setInvoiceFileService(asUser(editorId), iparams(id), { file_id: f.fileId }), codeOf("DOCUMENT_FILE_NOT_FOUND"));
    }
    const f2 = await makeFile(projectId);
    await isvc.setInvoiceFileService(asUser(editorId), iparams(id), { file_id: f2.fileId });
    assert.equal(await fileRowExists(f1.fileId), false);
    assert.equal(fs.existsSync(f1.filePath), false, "los bytes anteriores se eliminaron");
    state.f2 = f2;
});

test("permisos: solo ver lee pero no escribe; el Editor crea y edita pero no da de baja; ajeno al proyecto no ve nada", async () => {
    const id = state.inv1.invoice_id;
    assert.equal((await isvc.getInvoiceByIdService(asUser(plainId), iparams(id))).number, "123");
    await assert.rejects(isvc.createInvoiceService(asUser(plainId), { projectId }, invDirect({ number: "P1" })), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(isvc.updateInvoiceService(asUser(plainId), iparams(id), { number: "5" }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(isvc.setInvoiceFileService(asUser(plainId), iparams(id), { file_id: null }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(isvc.listInvoicesService(asUser(outsiderId), { projectId }, {}), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    await assert.rejects(isvc.deleteInvoiceService(asUser(editorId), iparams(id)), codeOf("INSUFFICIENT_PERMISSIONS"));
    assert.equal(await fileRowExists(state.f2.fileId), true, "el intento rechazado no borra nada");
});

test("baja: elimina el archivo, libera serie y número y libera el candado de cantidad; la línea ya citada se conserva", async () => {
    const id = state.inv1.invoice_id;
    await isvc.deleteInvoiceService(owner(), iparams(id));
    assert.equal(await fileRowExists(state.f2.fileId), false, "la baja elimina el archivo físico");
    assert.equal(fs.existsSync(state.f2.filePath), false);
    await assert.rejects(isvc.getInvoiceByIdService(owner(), iparams(id)), codeOf("INVOICE_NOT_FOUND"));
    await assert.rejects(isvc.deleteInvoiceService(owner(), iparams(id)), codeOf("INVOICE_NOT_FOUND"));
    await assert.rejects(isvc.addInvoiceItemService(asUser(editorId), iparams(id), invDirect().items[0]), codeOf("INVOICE_NOT_FOUND"));
    const [row] = await q(`SELECT deleted_at, file_id FROM invoices WHERE invoice_id = $1`, [id]);
    assert.ok(row.deleted_at);
    assert.equal(row.file_id, null);
    const again = await isvc.createInvoiceService(owner(), { projectId }, invDirect({ number: "123" }));
    assert.equal(again.number, "123", "serie y número quedaron libres");

    // La factura 124 sigue activa sobre la línea 0 de la orden A: se da de baja también y se libera el candado.
    const line0 = state.poA.items[0].purchase_order_item_id;
    await isvc.deleteInvoiceService(owner(), iparams(state.inv2.invoice_id));
    const edited = await psvc.updatePurchaseOrderItemService(asUser(editorId), oparams(state.poA.purchase_order_id, { itemId: line0 }), { quantity_ordered: 90 });
    assert.equal(edited.items[0].quantity_ordered, "90.000000", "sin facturas activas la cantidad se puede editar");
    await assert.rejects(psvc.deletePurchaseOrderItemService(asUser(editorId), oparams(state.poA.purchase_order_id, { itemId: line0 })), codeOf("PURCHASE_ORDER_ITEM_LOCKED"), "la FK conserva la línea citada por facturas dadas de baja");
    // La orden B sigue con su factura activa (F001-123 del proveedor B): no se da de baja hasta darla de baja.
    await assert.rejects(psvc.deletePurchaseOrderService(owner(), oparams(state.poB.purchase_order_id)), codeOf("PURCHASE_ORDER_HAS_DOCUMENTS"));
    await isvc.deleteInvoiceService(owner(), iparams(state.inv3.invoice_id));
    await psvc.deletePurchaseOrderService(owner(), oparams(state.poB.purchase_order_id));
});

test("vaciar Almacén: elimina facturas (incluidas las dadas de baja), órdenes, cotizaciones y proveedores", async () => {
    const counts = await emptyAlmacenContentService(owner(), { projectId });
    assert.ok(counts.invoices >= 7, "incluidas las dadas de baja");
    assert.ok(counts.purchase_orders >= 2);
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM invoice_items WHERE invoice_id IN (SELECT invoice_id FROM invoices WHERE project_id = $1)`, [projectId]);
    assert.equal(n, 0);
    await pool.query(`DELETE FROM files WHERE file_id = ANY($1::bigint[])`, [state.leftovers ?? []]);
});
