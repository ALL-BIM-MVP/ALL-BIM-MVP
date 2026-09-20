// quotations.service.test.js
//
// Test de integración (BD real) de la Fase 4 de
// docs/almacen-ingreso-productos/05-roadmap.md: cotizaciones por línea de un
// requerimiento (parciales, varias por requerimiento, total solo por línea),
// candados sobre el requerimiento, archivo, permisos y proveedores. Corre
// contra dist/ ya compilado, sin mocks del driver.
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
const schemas = await import("../dist/schemas/almacen/quotation.schema.js");

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

const reqBody = (overrides = {}) => ({
    number: "REQ-001", requisition_date: "2026-09-10", requester: "Almacenero",
    items: [
        { product_id: productId, description: "Cemento", quantity_requested: 100 },
        { product_id: productId, description: "Cemento para columnas", quantity_requested: 40 },
        { product_id: productId, description: "Cemento para losa", quantity_requested: 60 },
    ],
    ...overrides,
});
const qBody = (overrides = {}) => ({
    supplier_id: supplierA, purchase_requisition_id: state.req?.purchase_requisition_id, number: "COT-100",
    quotation_date: "2026-09-12", currency: "PEN", valid_until: "2026-09-30", total_amount: 1240.5,
    items: [
        // El documento da precio unitario y total.
        { purchase_requisition_item_id: state.reqItems?.[0], description: "Cemento Sol bolsa 42.5 kg", quantity_quoted: 100, unit_price: 12.4, line_total: 1240 },
        // El documento da SOLO el total de la línea ("40 bolsas a S/ 0.5 en total").
        { purchase_requisition_item_id: state.reqItems?.[1], description: "Cemento Sol para columnas", quantity_quoted: 40, line_total: 0.5 },
    ],
    ...overrides,
});
const qparams = (id, extra = {}) => ({ projectId, quotationId: id, ...extra });
const owner = () => asUser(OWNER_USER_ID);

test("Zod: moneda cerrada, fechas, línea con total obligatorio y sin repetir línea del requerimiento", () => {
    const { CreateQuotationBodySchema: Create, UpdateQuotationBodySchema: Patch, UpdateQuotationItemBodySchema: PatchItem,
        SetQuotationFileBodySchema: SetFile } = schemas;
    const ok = { supplier_id: 1, purchase_requisition_id: 1, number: "C-1", quotation_date: "2026-09-12", currency: "PEN",
        items: [{ purchase_requisition_item_id: 1, description: "x", quantity_quoted: 1, line_total: 10 }] };
    assert.equal(Create.safeParse(ok).success, true);
    assert.equal(Create.safeParse({ ...ok, currency: "USD" }).success, true);
    for (const bad of ["EUR", "pen", "S/", "", undefined]) {
        assert.equal(Create.safeParse({ ...ok, currency: bad }).success, false, `moneda: ${String(bad)}`);
    }
    assert.equal(Create.safeParse({ ...ok, items: [] }).success, false, "sin líneas");
    assert.equal(Create.safeParse({ ...ok, quotation_date: "12/09/2026" }).success, false);
    assert.equal(Create.safeParse({ ...ok, valid_until: "2026-09-01" }).success, false, "validez anterior a la fecha");
    assert.equal(Create.safeParse({ ...ok, total_amount: -1 }).success, false);
    const line = ok.items[0];
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, line_total: undefined }] }).success, false, "el total de la línea es obligatorio");
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, unit_price: null, discount_amount: null, tax_amount: null }] }).success, true, "solo total");
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, quantity_quoted: 0 }] }).success, false);
    assert.equal(Create.safeParse({ ...ok, items: [{ ...line, line_total: 1e15 }] }).success, false, "desborda NUMERIC");
    assert.equal(Create.safeParse({ ...ok, items: [line, { ...line }] }).success, false, "misma línea del requerimiento dos veces");
    assert.equal(Patch.safeParse({}).success, false);
    assert.equal(Patch.safeParse({ total_amount: null, valid_until: null }).success, true);
    assert.equal(Patch.safeParse({ currency: "EUR" }).success, false);
    assert.equal(PatchItem.safeParse({}).success, false);
    assert.equal(PatchItem.safeParse({ unit_price: null }).success, true);
    assert.equal(PatchItem.safeParse({ purchase_requisition_item_id: 2 }).success, false, "la línea del requerimiento no se cambia por PATCH: un body sin campos válidos se rechaza");
    assert.equal(SetFile.safeParse({}).success, false);
});

test("preparar: un requerimiento con 3 líneas", async () => {
    state.req = await rsvc.createPurchaseRequisitionService(owner(), { projectId }, reqBody());
    state.reqItems = state.req.items.map((i) => i.purchase_requisition_item_id);
    assert.equal(state.reqItems.length, 3);
});

test("crear: cotiza solo 2 de 3 líneas; una con precio unitario y otra solo con total; trae proveedor, requerimiento y suma de líneas", async () => {
    const created = await qsvc.createQuotationService(owner(), { projectId }, qBody());
    state.q1 = created;
    assert.equal(created.number, "COT-100");
    assert.equal(created.currency, "PEN");
    assert.equal(created.quotation_date, "2026-09-12");
    assert.equal(created.valid_until, "2026-09-30");
    assert.equal(created.total_amount, "1240.500000", "total de la cabecera tal como el documento");
    assert.equal(created.lines_total, "1240.500000", "suma derivada de las líneas");
    assert.equal(created.supplier.ruc, "20123456789");
    assert.equal(created.purchase_requisition.number, "REQ-001");
    assert.equal(created.file, null);
    assert.equal(created.items.length, 2, "cotización parcial");
    const [withPrice, totalOnly] = created.items;
    assert.equal(withPrice.unit_price, "12.400000");
    assert.equal(totalOnly.unit_price, null, "no figuraba el precio unitario");
    assert.equal(totalOnly.discount_amount, null);
    assert.equal(totalOnly.line_total, "0.500000");
    assert.equal(String(withPrice.product.product_id), String(productId), "el producto sale de la línea del requerimiento");
    assert.equal(withPrice.requisition_item.quantity_requested, "100.000000");
    assert.notEqual(withPrice.description, withPrice.requisition_item.description, "la descripción es el texto de la cotización");
    state.qItemA = withPrice.quotation_item_id;
    state.qItemB = totalOnly.quotation_item_id;
});

test("varias cotizaciones por requerimiento: otro proveedor, y el mismo proveedor con otro número; el mismo número se rechaza", async () => {
    const other = await qsvc.createQuotationService(owner(), { projectId }, qBody({
        supplier_id: supplierB, number: "COT-100", total_amount: null, currency: "USD",
        items: [{ purchase_requisition_item_id: state.reqItems[0], description: "Cemento Andino", quantity_quoted: 100, unit_price: 3, line_total: 300 }],
    }));
    state.q2 = other;
    assert.equal(other.currency, "USD");
    assert.equal(other.total_amount, null);
    await qsvc.createQuotationService(owner(), { projectId }, qBody({ number: "COT-101", items: [
        { purchase_requisition_item_id: state.reqItems[2], description: "Cemento losa", quantity_quoted: 60, line_total: 700 },
    ] }));
    await assert.rejects(qsvc.createQuotationService(owner(), { projectId }, qBody()), codeOf("QUOTATION_DUPLICATE_NUMBER"));
});

test("crear: reglas de proyecto y de línea; no queda nada a medias", async () => {
    const [{ n: before }] = await q(`SELECT COUNT(*)::int AS n FROM quotations WHERE project_id = $1`, [projectId]);
    const mk = (over) => qBody({ number: "COT-X", ...over });
    await assert.rejects(qsvc.createQuotationService(owner(), { projectId }, mk({ supplier_id: otherSupplier })), codeOf("SUPPLIER_NOT_FOUND"));
    await assert.rejects(qsvc.createQuotationService(owner(), { projectId }, mk({ purchase_requisition_id: 999999999 })), codeOf("PURCHASE_REQUISITION_NOT_FOUND"));
    await assert.rejects(qsvc.createQuotationService(owner(), { projectId }, mk({ items: [
        { purchase_requisition_item_id: 999999999, description: "x", quantity_quoted: 1, line_total: 1 } ] })), codeOf("QUOTATION_REQUISITION_ITEM_INVALID"));
    await assert.rejects(qsvc.createQuotationService(owner(), { projectId }, mk({ items: [
        { purchase_requisition_item_id: state.reqItems[0], product_id: otherProductId, description: "x", quantity_quoted: 1, line_total: 1 } ] })), codeOf("QUOTATION_PRODUCT_MISMATCH"));
    // El producto enviado, si coincide, se acepta.
    await qsvc.createQuotationService(owner(), { projectId }, mk({ number: "COT-OK", items: [
        { purchase_requisition_item_id: state.reqItems[0], product_id: productId, description: "x", quantity_quoted: 1, line_total: 1 } ] }));
    const [{ n: after }] = await q(`SELECT COUNT(*)::int AS n FROM quotations WHERE project_id = $1`, [projectId]);
    assert.equal(after, before + 1, "los fallidos no dejaron cabecera");

    // Una línea de OTRO requerimiento no se puede cotizar aquí.
    const req2 = await rsvc.createPurchaseRequisitionService(owner(), { projectId }, reqBody({ number: "REQ-002" }));
    await assert.rejects(qsvc.createQuotationService(owner(), { projectId }, mk({ number: "COT-Y", items: [
        { purchase_requisition_item_id: req2.items[0].purchase_requisition_item_id, description: "x", quantity_quoted: 1, line_total: 1 } ] })),
        codeOf("QUOTATION_REQUISITION_ITEM_INVALID"));
    state.req2 = req2;
});

test("listar y filtrar por requerimiento, proveedor y texto; el detalle respeta el proyecto", async () => {
    const all = await qsvc.listQuotationsService(asUser(plainId), { projectId }, {});
    assert.equal(all.length, 4);
    assert.equal(all.find((x) => x.quotation_id === state.q1.quotation_id).items_count, 2);
    assert.equal(all.find((x) => x.quotation_id === state.q1.quotation_id).has_file, false);
    const byReq = await qsvc.listQuotationsService(asUser(plainId), { projectId }, { purchase_requisition_id: state.req.purchase_requisition_id });
    assert.equal(byReq.length, 4);
    assert.equal((await qsvc.listQuotationsService(asUser(plainId), { projectId }, { purchase_requisition_id: state.req2.purchase_requisition_id })).length, 0);
    assert.equal((await qsvc.listQuotationsService(asUser(plainId), { projectId }, { supplier_id: supplierB })).length, 1);
    assert.equal((await qsvc.listQuotationsService(asUser(plainId), { projectId }, { search: "ferret" })).length, 1, "por nombre del proveedor");
    assert.equal((await qsvc.listQuotationsService(asUser(plainId), { projectId }, { search: "COT-101" })).length, 1);
    assert.equal((await qsvc.listQuotationsService(asUser(plainId), { projectId }, { search: "%" })).length, 0, "% no es comodín");
    await assert.rejects(
        qsvc.getQuotationByIdService(owner(), { projectId: otherProjectId, quotationId: state.q1.quotation_id }),
        codeOf("QUOTATION_NOT_FOUND")
    );
});

test("PATCH cabecera: solo lo enviado; null limpia total y validez; la validez no puede ser anterior a la fecha", async () => {
    const id = state.q1.quotation_id;
    const a = await qsvc.updateQuotationService(asUser(editorId), qparams(id), { currency: "USD", commercial_terms: "Pago a 30 días" });
    assert.equal(a.currency, "USD");
    assert.equal(a.commercial_terms, "Pago a 30 días");
    assert.equal(a.number, "COT-100", "lo no enviado no se toca");
    assert.equal(a.total_amount, "1240.500000");
    assert.equal(a.updated_by, editorId);
    const b = await qsvc.updateQuotationService(asUser(editorId), qparams(id), { total_amount: null, valid_until: null, currency: "PEN" });
    assert.equal(b.total_amount, null);
    assert.equal(b.valid_until, null);
    assert.equal(b.lines_total, "1240.500000", "la suma derivada no depende del total del documento");
    await assert.rejects(qsvc.updateQuotationService(asUser(editorId), qparams(id), { valid_until: "2026-09-01" }), codeOf("QUOTATION_INVALID_VALIDITY_DATE"));
    await assert.rejects(qsvc.updateQuotationService(asUser(editorId), qparams(id), { quotation_date: "2026-12-31", valid_until: "2026-10-01" }), codeOf("QUOTATION_INVALID_VALIDITY_DATE"));
    await assert.rejects(qsvc.updateQuotationService(asUser(editorId), qparams(id), { number: "COT-101" }), codeOf("QUOTATION_DUPLICATE_NUMBER"), "COT-101 ya existe para ese proveedor");
    await assert.rejects(qsvc.updateQuotationService(asUser(editorId), qparams(999999999), { number: "Z" }), codeOf("QUOTATION_NOT_FOUND"));
});

test("líneas: agregar, PATCH parcial (con y sin precio unitario) y quitar; ids estables; la última no se quita", async () => {
    const id = state.q1.quotation_id;
    const added = await qsvc.addQuotationItemService(asUser(editorId), qparams(id), {
        purchase_requisition_item_id: state.reqItems[2], description: "Cemento losa", quantity_quoted: 60, unit_price: 11, tax_amount: 118.8, line_total: 660,
    });
    assert.equal(added.items.length, 3);
    const itemC = added.items[2].quotation_item_id;
    assert.equal(added.lines_total, "1900.500000");

    await assert.rejects(qsvc.addQuotationItemService(asUser(editorId), qparams(id), {
        purchase_requisition_item_id: state.reqItems[2], description: "otra vez", quantity_quoted: 1, line_total: 1 }), codeOf("QUOTATION_REQUISITION_ITEM_DUPLICATED"));
    await assert.rejects(qsvc.addQuotationItemService(asUser(editorId), qparams(id), {
        purchase_requisition_item_id: state.req2.items[0].purchase_requisition_item_id, description: "x", quantity_quoted: 1, line_total: 1 }), codeOf("QUOTATION_REQUISITION_ITEM_INVALID"));

    const patched = await qsvc.updateQuotationItemService(asUser(editorId), qparams(id, { itemId: state.qItemA }), { line_total: 1300, unit_price: null });
    const a = patched.items.find((i) => i.quotation_item_id === state.qItemA);
    assert.equal(a.line_total, "1300.000000");
    assert.equal(a.unit_price, null, "ahora solo se conoce el total");
    assert.equal(a.description, "Cemento Sol bolsa 42.5 kg", "lo no enviado no se toca");
    assert.deepEqual(patched.items.map((i) => i.quotation_item_id), [state.qItemA, state.qItemB, itemC], "ids estables");
    await assert.rejects(qsvc.updateQuotationItemService(asUser(editorId), qparams(id, { itemId: 999999999 }), { line_total: 1 }), codeOf("QUOTATION_ITEM_NOT_FOUND"));
    await assert.rejects(qsvc.updateQuotationItemService(asUser(editorId), qparams(state.q2.quotation_id, { itemId: state.qItemA }), { line_total: 1 }), codeOf("QUOTATION_ITEM_NOT_FOUND"), "línea de otra cotización");

    await qsvc.deleteQuotationItemService(asUser(editorId), qparams(id, { itemId: itemC }));
    await qsvc.deleteQuotationItemService(asUser(editorId), qparams(id, { itemId: state.qItemB }));
    await assert.rejects(qsvc.deleteQuotationItemService(asUser(editorId), qparams(id, { itemId: state.qItemA })), codeOf("QUOTATION_LAST_ITEM"));
});

test("candados sobre el requerimiento: una línea cotizada no cambia cantidad/producto ni se quita; el resto sí", async () => {
    const rid = state.req.purchase_requisition_id;
    const rparams = (extra = {}) => ({ projectId, purchaseRequisitionId: rid, ...extra });
    await assert.rejects(rsvc.updatePurchaseRequisitionItemService(asUser(editorId), rparams({ itemId: state.reqItems[0] }), { quantity_requested: 5 }), codeOf("PURCHASE_REQUISITION_ITEM_LOCKED"));
    await assert.rejects(rsvc.updatePurchaseRequisitionItemService(asUser(editorId), rparams({ itemId: state.reqItems[0] }), { product_id: productId }), codeOf("PURCHASE_REQUISITION_ITEM_LOCKED"));
    await assert.rejects(rsvc.deletePurchaseRequisitionItemService(asUser(editorId), rparams({ itemId: state.reqItems[0] })), codeOf("PURCHASE_REQUISITION_ITEM_LOCKED"));
    const ok = await rsvc.updatePurchaseRequisitionItemService(asUser(editorId), rparams({ itemId: state.reqItems[0] }), { description: "Cemento (texto corregido)", estimated_unit_price: 12 });
    assert.equal(ok.items[0].description, "Cemento (texto corregido)", "descripción y precio estimado siguen editables");
    // La línea 2 (índice 1) solo fue cotizada por una cotización que ya perdió esa línea: queda libre.
    const free = await rsvc.updatePurchaseRequisitionItemService(asUser(editorId), rparams({ itemId: state.reqItems[1] }), { quantity_requested: 45 });
    assert.equal(free.items[1].quantity_requested, "45.000000");
    await assert.rejects(rsvc.deletePurchaseRequisitionService(owner(), rparams()), codeOf("PURCHASE_REQUISITION_HAS_DOCUMENTS"));
});

test("proveedor: documents_count suma cotizaciones, el RUC se bloquea y la baja se rechaza; una cotización dada de baja no lo ata", async () => {
    const supplier = await ssvc.getSupplierByIdService(owner(), { projectId, supplierId: supplierB });
    assert.equal(supplier.documents_count, 1);
    await assert.rejects(ssvc.updateSupplierService(owner(), { projectId, supplierId: supplierB }, { ruc: "20111111111", name: "Ferretería Norte SAC" }), codeOf("SUPPLIER_RUC_LOCKED"));
    await assert.rejects(ssvc.deleteSupplierService(owner(), { projectId, supplierId: supplierB }), codeOf("SUPPLIER_HAS_DOCUMENTS"));
    await qsvc.deleteQuotationService(owner(), qparams(state.q2.quotation_id));
    assert.equal((await ssvc.getSupplierByIdService(owner(), { projectId, supplierId: supplierB })).documents_count, 0);
    await ssvc.updateSupplierService(owner(), { projectId, supplierId: supplierB }, { ruc: "20987654321", name: "Ferretería Norte SAC (editado)" });
});

test("archivo: adjuntar, reemplazar y quitar elimina el anterior; no compartir con un requerimiento; DELETE /files se rechaza", async () => {
    const id = state.q1.quotation_id;
    const f1 = await makeFile(projectId);
    const withFile = await qsvc.setQuotationFileService(asUser(editorId), qparams(id), { file_id: f1.fileId });
    assert.equal(withFile.file.file_id, f1.fileId);
    assert.match(withFile.file.url, /^\/files\/\d+\/content\?token=/);
    assert.equal((await qsvc.listQuotationsService(asUser(plainId), { projectId }, { search: "COT-100" }))[0].has_file, true);
    await assert.rejects(deleteFileService(owner(), { projectId, fileId: f1.fileId }), codeOf("FILE_IN_USE"));

    // El archivo de un requerimiento no se puede adjuntar a una cotización (tablas distintas).
    await rsvc.setPurchaseRequisitionFileService(asUser(editorId), { projectId, purchaseRequisitionId: state.req2.purchase_requisition_id }, { file_id: (await makeFile(projectId)).fileId }).then(async (d) => {
        await assert.rejects(qsvc.setQuotationFileService(asUser(editorId), qparams(id), { file_id: d.file.file_id }), codeOf("DOCUMENT_FILE_ALREADY_ATTACHED"));
    });
    const other = await makeFile(otherProjectId);
    const metrados = await makeFile(projectId, "metrados");
    for (const f of [other, metrados]) {
        await assert.rejects(qsvc.setQuotationFileService(asUser(editorId), qparams(id), { file_id: f.fileId }), codeOf("DOCUMENT_FILE_NOT_FOUND"));
    }
    const f2 = await makeFile(projectId);
    await qsvc.setQuotationFileService(asUser(editorId), qparams(id), { file_id: f2.fileId });
    assert.equal(await fileRowExists(f1.fileId), false);
    assert.equal(fs.existsSync(f1.filePath), false, "los bytes anteriores se eliminaron");
    assert.equal(fs.existsSync(f2.filePath), true);
    state.f2 = f2; state.metrados = metrados; state.other = other;
});

test("permisos: solo ver lee pero no escribe; el Editor crea y edita pero no da de baja; ajeno al proyecto no ve nada", async () => {
    const id = state.q1.quotation_id;
    assert.equal((await qsvc.getQuotationByIdService(asUser(plainId), qparams(id))).number, "COT-100");
    await assert.rejects(qsvc.createQuotationService(asUser(plainId), { projectId }, qBody({ number: "P-1" })), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(qsvc.updateQuotationService(asUser(plainId), qparams(id), { number: "P" }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(qsvc.setQuotationFileService(asUser(plainId), qparams(id), { file_id: null }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(qsvc.listQuotationsService(asUser(outsiderId), { projectId }, {}), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    await assert.rejects(qsvc.deleteQuotationService(asUser(editorId), qparams(id)), codeOf("INSUFFICIENT_PERMISSIONS"));
    assert.equal(await fileRowExists(state.f2.fileId), true, "el intento rechazado no borra nada");
});

test("baja: elimina el archivo, libera el número y deja libre la línea del requerimiento; el requerimiento ya se puede dar de baja", async () => {
    const id = state.q1.quotation_id;
    await qsvc.deleteQuotationService(owner(), qparams(id));
    assert.equal(await fileRowExists(state.f2.fileId), false, "la baja elimina el archivo físico");
    assert.equal(fs.existsSync(state.f2.filePath), false);
    await assert.rejects(qsvc.getQuotationByIdService(owner(), qparams(id)), codeOf("QUOTATION_NOT_FOUND"));
    await assert.rejects(qsvc.deleteQuotationService(owner(), qparams(id)), codeOf("QUOTATION_NOT_FOUND"));
    await assert.rejects(qsvc.addQuotationItemService(asUser(editorId), qparams(id), { purchase_requisition_item_id: state.reqItems[0], description: "x", quantity_quoted: 1, line_total: 1 }), codeOf("QUOTATION_NOT_FOUND"));
    const [row] = await q(`SELECT deleted_at, file_id FROM quotations WHERE quotation_id = $1`, [id]);
    assert.ok(row.deleted_at);
    assert.equal(row.file_id, null);
    // El número vuelve a estar disponible.
    const again = await qsvc.createQuotationService(owner(), { projectId }, qBody({ items: [
        { purchase_requisition_item_id: state.reqItems[0], description: "Cemento", quantity_quoted: 100, line_total: 1 } ] }));
    assert.equal(again.number, "COT-100");
});

test("una cotización dada de baja ya no bloquea editar la cantidad de la línea, pero la conserva (la línea no se quita)", async () => {
    const rid = state.req2.purchase_requisition_id;
    const lineId = state.req2.items[2].purchase_requisition_item_id;
    const rparams = { projectId, purchaseRequisitionId: rid, itemId: lineId };
    const quoted = await qsvc.createQuotationService(owner(), { projectId }, qBody({ purchase_requisition_id: rid, number: "COT-R2", items: [
        { purchase_requisition_item_id: lineId, description: "x", quantity_quoted: 1, line_total: 1 } ] }));
    await assert.rejects(rsvc.updatePurchaseRequisitionItemService(asUser(editorId), rparams, { quantity_requested: 7 }), codeOf("PURCHASE_REQUISITION_ITEM_LOCKED"));
    await qsvc.deleteQuotationService(owner(), { projectId, quotationId: quoted.quotation_id });
    const edited = await rsvc.updatePurchaseRequisitionItemService(asUser(editorId), rparams, { quantity_requested: 7 });
    assert.equal(edited.items[2].quantity_requested, "7.000000");
    await assert.rejects(rsvc.deletePurchaseRequisitionItemService(asUser(editorId), rparams), codeOf("PURCHASE_REQUISITION_ITEM_LOCKED"), "la FK conserva la línea de la cotización dada de baja");
    // Sin cotizaciones activas, el requerimiento se puede dar de baja.
    await rsvc.deletePurchaseRequisitionService(owner(), { projectId, purchaseRequisitionId: rid });
});

test("vaciar Almacén: elimina cotizaciones (incluidas las dadas de baja), requerimientos y proveedores", async () => {
    const counts = await emptyAlmacenContentService(owner(), { projectId });
    assert.ok(counts.quotations >= 4);
    assert.ok(counts.purchase_requisitions >= 2, "incluido el requerimiento dado de baja");
    assert.equal(counts.suppliers, 2);
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM quotation_items WHERE quotation_id IN (SELECT quotation_id FROM quotations WHERE project_id = $1)`, [projectId]);
    assert.equal(n, 0);
    await pool.query(`DELETE FROM files WHERE file_id = ANY($1::bigint[])`, [[state.metrados.fileId, state.other.fileId]]);
});
