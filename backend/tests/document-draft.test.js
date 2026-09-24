// document-draft.test.js
//
// Lectura de documentos con IA (POST /document-drafts). La IA NO se llama de verdad: se reemplaza por un
// lector simulado que devuelve lo "leído". Se prueba todo lo nuestro: las piezas puras (texto, RUC, fechas,
// coincidencias), el proveedor por RUC, la orden citada, los productos candidatos, los avisos, los errores del
// archivo y que el borrador no guarda nada.
//
// Correr: npm test   (desde backend/)
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import pool from "../dist/db/database.js";
import { createFixedCategoriesForProject } from "../dist/services/almacen/category.service.js";
import { emptyAlmacenContentService } from "../dist/services/almacen/almacen-content.service.js";
import { createSupplierService } from "../dist/services/almacen/supplier.service.js";
import { createPurchaseOrderService } from "../dist/services/almacen/purchase-order.service.js";
import { createInvoiceService } from "../dist/services/almacen/invoice.service.js";
import { createDocumentDraftService } from "../dist/services/almacen/document-draft.service.js";
import { setDocumentReaderForTests } from "../dist/services/ai/document-reader.js";
import { CreateDocumentDraftBodySchema } from "../dist/schemas/almacen/document-draft.schema.js";
import { DocumentReadSchema } from "../dist/services/ai/document-read.schema.js";
import * as M from "../dist/services/almacen/document-draft.mapping.js";

const OWNER_USER_ID = 1;
const user = { user_id: OWNER_USER_ID, role_id: 4, email: "test@example.test" };
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const codeOf = (c) => (e) => e?.response?.code === c;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "draft-"));
let projectId, supplierId, cementId, partidaId, fileCounter = 0, outsiderId, editorless;

// Documento "leído" por defecto; cada prueba lo ajusta.
const read = (over = {}) => ({
    detected_type: "factura", supplier: { ruc: "20123456789", name: "Cementos del Sur SAC" }, customer: { ruc: "20601116082", name: "China Railway" },
    series: "f001", number: "00000123", date: "2026-09-10", currency: "PEN", subtotal: 1000, tax: 180, total: 1180, valid_until: null, commercial_terms: null, requester: null,
    referenced_order: null, warnings: [],
    items: [{ code: null, line_id: null, description: "Cemento Portland tipo I bolsa 42.5 kg", unit: "bls", quantity: 10, unit_price: 100, line_total: 1000, category: null }],
    ...over,
});
let nextRead = read();
setDocumentReaderForTests({ read: async () => ({ read: nextRead, engine: { provider: "simulado", model: "prueba" }, usage: { input_tokens: 1, output_tokens: 1 } }) });
const makeFile = async ({ mime = "image/png", size = 10, module = "almacen", project = () => projectId } = {}) => {
    const filePath = path.join(TMP, `${randomUUID()}.bin`); fs.writeFileSync(filePath, "x".repeat(10));
    return (await q(`INSERT INTO files (project_id, module_id, file_type, name, file_path, file_size, mime_type, uploaded_by)
        VALUES ($1, (SELECT module_id FROM modules WHERE code = $2), 'image', 'doc.png', $3, $4, $5, $6) RETURNING file_id`, [project(), module, filePath, size, mime, OWNER_USER_ID]))[0].file_id;
};
const draft = async (type, over, options) => { nextRead = read(over); return createDocumentDraftService(user, { projectId }, { file_id: await makeFile(options), document_type: type }); };

before(async () => {
    projectId = Number((await q(`INSERT INTO projects (name, owner_id, created_by) VALUES ('[test] draft ' || $1, $2, $2) RETURNING project_id`, [randomUUID(), OWNER_USER_ID]))[0].project_id);
    const client = await pool.connect();
    try { await createFixedCategoriesForProject(client, projectId, OWNER_USER_ID); } finally { client.release(); }
    const cat = async (name) => (await q(`SELECT category_id FROM categories WHERE project_id = $1 AND name = $2`, [projectId, name]))[0].category_id;
    const mk = async (categoryId, code, fixed, base, display, name, unit) => (await q(`INSERT INTO products (project_id, category_id, code, is_fixed, base_product_code, display_id, name, unit, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING product_id`, [projectId, categoryId, code, fixed, base, display, name, unit, OWNER_USER_ID]))[0].product_id;
    partidaId = await mk(await cat("Partida"), "1.2.2.5.1", true, null, 1, "PUERTA CONTRAPLACADA TRIPLAY LUPUNA", "und");
    cementId = await mk(await cat("Materiales"), "MAT-1.2.2.5.1", false, "1.2.2.5.1", 1, "Cemento Portland tipo I", "bls");
    await mk(await cat("Materiales"), "MAT-1.2.2.5.1", false, "1.2.2.5.1", 2, "COLA SINTETICA", "gal");
    await mk(await cat("Equipo"), "EQ-1.2.2.5.1", false, "1.2.2.5.1", 1, "SIERRA CIRCULAR", "hm");
    supplierId = (await createSupplierService(user, { projectId }, { ruc: "20123456789", name: "Cementos del Sur SAC" })).supplier_id;
    outsiderId = (await q(`INSERT INTO users (name, email, password_hash, role_id) VALUES ('[test] fuera', $1, 'x', 4) RETURNING user_id`, [`test-${randomUUID()}@example.test`]))[0].user_id;
});
after(async () => {
    try {
        setDocumentReaderForTests(null);
        try { await emptyAlmacenContentService(user, { projectId }); } catch { /* ya vacío */ }
        await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
        await pool.query(`DELETE FROM users WHERE user_id = $1`, [outsiderId]);
    } finally { await pool.end(); fs.rmSync(TMP, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------------------------
test("piezas puras: texto, RUC, serie, fecha y unidades", () => {
    assert.equal(M.normalizeText("  Cañería  1/2\" — Ñandú "), "caneria 1 2 nandu");
    assert.equal(M.normalizeRuc("20 4028-85549"), "20402885549");
    assert.equal(M.isValidRuc("20402885549"), true); assert.equal(M.isValidRuc("204028855449"), false); assert.equal(M.isValidRuc(null), false);
    assert.equal(M.normalizeSeries("f-001"), "F001"); assert.equal(M.normalizeSeries(null), null);
    assert.equal(M.validDate("2026-09-10"), "2026-09-10"); assert.equal(M.validDate("2026-02-30"), null); assert.equal(M.validDate("10/09/2026"), null);
    assert.equal(M.normalizeUnit("UND."), "und"); assert.equal(M.normalizeUnit("m³"), "m3"); assert.equal(M.normalizeUnit("Millares"), "millar"); assert.equal(M.normalizeUnit(null), null);
    assert.equal(M.positive(-1), null); assert.equal(M.positive(0), 0); assert.equal(M.positive(NaN), null);
    assert.equal(M.sameOrderNumber("OC-00490", "oc00490"), true); assert.equal(M.sameOrderNumber("OC-1", "OC-2"), false);
});

test("piezas puras: parecido de textos, candidatos de producto y suma de totales", () => {
    assert.ok(M.similarity("Cemento Portland tipo I bolsa 42.5 kg", "Cemento Portland tipo I") >= 0.8);
    assert.ok(M.similarity("Clavos 3 pulgadas", "Cemento Portland") < 0.2);
    assert.equal(M.similarity("", "algo"), 0);
    const catalog = [
        { product_id: "1", category_id: 1, category_name: "Materiales", code: "MAT-1.2.2.5.1", display_id: 1, name: "CLAVOS PARA MADERA CON CABEZA", unit: "kg" },
        { product_id: "2", category_id: 1, category_name: "Materiales", code: "MAT-1.2.2.5.1", display_id: 2, name: "COLA SINTETICA", unit: "gal" },
        { product_id: "3", category_id: 2, category_name: "Equipo", code: "EQ-1.2.2.5.1", display_id: 1, name: "SIERRA CIRCULAR", unit: "hm" },
    ];
    // Mismo código para varios materiales: manda la descripción.
    const cola = M.rankProducts({ code: "MAT-1.2.2.5.1", line_id: "00002", description: "COLA SINTETICA", unit: "gal", quantity: 2, unit_price: null, line_total: null, category: "material" }, catalog);
    assert.equal(cola.suggested?.product_id, "2");
    // Un ID impreso que coincide con el de un producto, pero con otra descripción, NO basta para sugerirlo.
    assert.equal(M.rankProducts({ code: null, line_id: "00001", description: "PUERTA CONTRAPLACADA TRIPLAY LUPUNA", unit: "Und", quantity: 1, unit_price: null, line_total: null, category: "equipo" },
        [{ product_id: "9", category_id: 2, category_name: "Equipo", code: "EQ-1", display_id: 1, name: "SIERRA CIRCULAR", unit: "hm" }]).suggested, null);
    assert.equal(M.findSupplierByName("CERAMICOS PERUANOS S.A.", [{ name: "Cerámicos Peruanos SAC" }, { name: "Concretos Supermix S.A." }])?.name, "Cerámicos Peruanos SAC");
    assert.equal(M.findSupplierByName("Ferretería Norte", [{ name: "Cerámicos Peruanos SAC" }]), null);
    // Un texto que no se parece a nada no sugiere nada.
    assert.equal(M.rankProducts({ code: null, line_id: null, description: "Pintura látex blanca", unit: "gal", quantity: 1, unit_price: null, line_total: null, category: null }, catalog).suggested, null);
    // Categoría equivocada baja el puntaje.
    const sierraEquipo = M.scoreProduct({ code: null, line_id: null, description: "SIERRA CIRCULAR", unit: "hm", quantity: 1, unit_price: null, line_total: null, category: "equipo" }, catalog[2]);
    const sierraMaterial = M.scoreProduct({ code: null, line_id: null, description: "SIERRA CIRCULAR", unit: "hm", quantity: 1, unit_price: null, line_total: null, category: "material" }, catalog[2]);
    assert.ok(sierraEquipo > sierraMaterial);
    assert.equal(M.lineAmountMatches({ quantity: 839, unit_price: 31.69, line_total: 26587.91 }), true);
    assert.equal(M.lineAmountMatches({ quantity: 829, unit_price: 31.69, line_total: 26587.91 }), false, "una cantidad mal leída no cuadra");
    assert.equal(M.lineAmountMatches({ quantity: 8, unit_price: null, line_total: null }), null);
    const items = (totals) => totals.map((t) => ({ line_total: t }));
    assert.equal(M.totalsMatch(items([500, 500]), { subtotal: 1000, total: 1180 }), true);
    assert.equal(M.totalsMatch(items([500, 400]), { subtotal: 1000, total: 1180 }), false);
    assert.equal(M.totalsMatch(items([500, null]), { subtotal: 1000, total: null }), null);
    const lines = [{ purchase_order_item_id: "10", description: "Cemento Portland tipo I", product_id: "1" }, { purchase_order_item_id: "11", description: "Arena gruesa", product_id: "2" }];
    const matched = M.matchOrderLines([{ description: "Arena gruesa lavada" }, { description: "Cemento Portland tipo I bolsa" }, { description: "Fierro" }], lines);
    assert.deepEqual(matched.map((m) => m?.line.purchase_order_item_id ?? null), ["11", "10", null]);
});

test("Zod: el cuerpo pide file_id y un tipo válido; la salida de la IA se valida estrictamente", () => {
    assert.equal(CreateDocumentDraftBodySchema.safeParse({ file_id: 3, document_type: "invoice" }).success, true);
    for (const bad of [{ file_id: 3 }, { document_type: "invoice" }, { file_id: 3, document_type: "recibo" }, { file_id: 0, document_type: "invoice" }]) assert.equal(CreateDocumentDraftBodySchema.safeParse(bad).success, false, JSON.stringify(bad));
    assert.equal(DocumentReadSchema.safeParse(read()).success, true);
    assert.equal(DocumentReadSchema.safeParse({ ...read(), currency: "EUR" }).success, false, "moneda fuera de PEN/USD");
    assert.equal(DocumentReadSchema.safeParse({ ...read(), items: [{ description: "x" }] }).success, false, "línea incompleta");
});

test("FACTURA: proveedor por RUC, orden citada, línea de la orden y producto de esa línea; el borrador no guarda nada", async () => {
    const order = await createPurchaseOrderService(user, { projectId }, { supplier_id: supplierId, number: "OC-00490", order_date: "2026-09-01", currency: "PEN",
        items: [{ product_id: cementId, description: "Cemento Portland tipo I", quantity_ordered: 10, line_total: 1000 }, { product_id: partidaId, description: "Puerta", quantity_ordered: 1, line_total: 50 }] });
    const before = (await q(`SELECT (SELECT COUNT(*) FROM invoices WHERE project_id = $1)::int AS i, (SELECT COUNT(*) FROM files WHERE project_id = $1)::int AS f`, [projectId]))[0];
    const d = await draft("invoice", { referenced_order: "oc 00490" });
    assert.deepEqual([d.supplier.match.supplier_id, d.supplier.to_create], [supplierId, null]);
    assert.equal(d.purchase_order.match.number, "OC-00490");
    assert.equal(String(d.draft.purchase_order_id), String(order.purchase_order_id));
    assert.deepEqual([d.draft.series, d.draft.number, d.draft.invoice_date, d.draft.currency, d.draft.total_amount], ["F001", "00000123", "2026-09-10", "PEN", 1180], "serie normalizada a mayúsculas");
    assert.equal(d.items[0].order_item_candidate.purchase_order_item_id, String(order.items[0].purchase_order_item_id));
    assert.equal(d.items[0].suggested_product_id, String(cementId), "con orden, el producto es el de la línea de la orden");
    assert.equal(d.draft.items[0].purchase_order_item_id, String(order.items[0].purchase_order_item_id));
    assert.equal(d.engine.provider, "simulado");
    assert.deepEqual(d.warnings, [], JSON.stringify(d.warnings));
    const after_ = (await q(`SELECT (SELECT COUNT(*) FROM invoices WHERE project_id = $1)::int AS i, (SELECT COUNT(*) FROM files WHERE project_id = $1)::int AS f`, [projectId]))[0];
    assert.equal(after_.i, before.i); assert.equal(after_.f, before.f + 1, "solo el archivo de la prueba: leer no crea ni modifica documentos");
});

test("proveedor nuevo: se ofrece crearlo con los datos leídos; RUC mal leído avisa y no ofrece nada", async () => {
    const d = await draft("invoice", { supplier: { ruc: "20987654321", name: "Ferretería Norte SAC" } });
    assert.equal(d.supplier.match, null);
    assert.deepEqual(d.supplier.to_create, { ruc: "20987654321", name: "Ferretería Norte SAC" });
    assert.ok(d.warnings.some((w) => w.code === "SUPPLIER_NOT_FOUND"));
    const bad = await draft("invoice", { supplier: { ruc: "2040288554", name: "X SAC" } });
    assert.equal(bad.supplier.to_create, null);
    assert.equal(bad.supplier.match, null);
    assert.ok(bad.warnings.some((w) => w.code === "RUC_INVALID"));
    // Sin RUC pero con el nombre de un proveedor registrado (cotizaciones que no traen el RUC del emisor): se empareja por nombre y se avisa.
    const byName = await draft("quotation", { detected_type: "cotizacion", supplier: { ruc: null, name: "CEMENTOS DEL SUR S.A.C." } });
    assert.equal(byName.supplier.match?.supplier_id, supplierId);
    assert.ok(byName.warnings.some((w) => w.code === "SUPPLIER_MATCHED_BY_NAME") && byName.warnings.some((w) => w.code === "SUPPLIER_RUC_MISSING"));
    const otherName = await draft("quotation", { detected_type: "cotizacion", supplier: { ruc: null, name: "Ladrillera Pirámide S.A." } });
    assert.equal(otherName.supplier.match, null);
    const none = await draft("invoice", { supplier: null });
    assert.ok(none.warnings.some((w) => w.code === "SUPPLIER_RUC_MISSING"));
});

test("avisos: campos que faltan, formato de serie y número, tipo equivocado, total que no cuadra, fecha inválida, documento repetido", async () => {
    const d = await draft("invoice", { detected_type: "guia_remision", series: "FACTURA-1", number: "ABC", date: "2026-02-30", currency: null, total: 5000, subtotal: 5000 });
    const codes = d.warnings.map((w) => `${w.code}:${w.field}`);
    for (const expected of ["DETECTED_TYPE_MISMATCH:null", "FORMAT_INVALID:series", "FORMAT_INVALID:number", "DATE_INVALID:date", "MISSING_FIELD:invoice_date", "MISSING_FIELD:currency", "TOTAL_MISMATCH:total_amount"]) assert.ok(codes.includes(expected), `${expected} en ${codes}`);
    assert.equal(d.draft.invoice_date, null, "una fecha inválida no se propone");
    assert.ok((await draft("invoice", { date: "2999-01-01" })).warnings.some((w) => w.code === "DATE_IN_FUTURE"));
    // Documento ya registrado: se avisa antes de llenar el resto.
    await createInvoiceService(user, { projectId }, { supplier_id: supplierId, series: "F001", number: "777", invoice_date: "2026-09-01", currency: "PEN", items: [{ product_id: cementId, description: "x", quantity_invoiced: 1, line_total: 1 }] });
    assert.ok((await draft("invoice", { number: "777" })).warnings.some((w) => w.code === "DUPLICATE_DOCUMENT"));
    assert.ok(!(await draft("invoice", { number: "778" })).warnings.some((w) => w.code === "DUPLICATE_DOCUMENT"));
    assert.ok((await draft("invoice", { items: [] })).warnings.some((w) => w.code === "NO_ITEMS"));
    const misread = await draft("invoice", { items: [{ code: null, line_id: null, description: "Cemento", unit: "bls", quantity: 829, unit_price: 31.69, line_total: 26587.91, category: null }], subtotal: 26587.91, total: 26587.91 });
    assert.ok(misread.warnings.some((w) => w.code === "LINE_AMOUNT_MISMATCH" && w.field === "items[0]"), "cantidad × precio ≠ total de la línea");
});

test("GUÍA: sin cantidades recibidas ni casillas (eso lo pone el usuario); sin orden no hay tipo de entrada sugerido", async () => {
    const d = await draft("goods-receipt", { detected_type: "guia_remision", series: "022", number: "0037215", date: "2022-06-07", currency: null, subtotal: null, tax: null, total: null,
        items: [{ code: "100017016", line_id: null, description: "Cemento Portland tipo I", unit: "bls", quantity: 8, unit_price: null, line_total: null, category: null }] });
    assert.deepEqual([d.draft.delivery_note_series, d.draft.delivery_note_number, d.draft.delivery_note_date, d.draft.entry_type], ["022", "0037215", "2022-06-07", null]);
    assert.equal(d.draft.items[0].quantity_per_delivery_note, 8);
    assert.equal("total_quantity" in d.draft.items[0] || "locations" in d.draft.items[0], false);
    assert.equal(d.items[0].suggested_product_id, String(cementId));
    assert.equal(d.warnings.filter((w) => w.code === "MISSING_FIELD").length, 0);
});

test("REQUERIMIENTO: código repetido entre materiales, se resuelve por descripción y categoría; sin número ni fecha avisa", async () => {
    const d = await draft("requisition", { detected_type: "requerimiento", supplier: null, customer: null, series: null, number: null, date: null, currency: null, subtotal: null, tax: null, total: null,
        items: [
            { code: "MAT-1.2.2.5.1", line_id: "00002", description: "COLA SINTETICA", unit: "gal", quantity: 2, unit_price: null, line_total: null, category: "material" },
            { code: "1.2.2.5.1", line_id: "00001", description: "PUERTA CONTRAPLACADA TRIPLAY LUPUNA", unit: "Und", quantity: 100, unit_price: null, line_total: null, category: "partida" },
            { code: null, line_id: null, description: "Pintura látex blanca", unit: "gal", quantity: 3, unit_price: null, line_total: null, category: null },
        ] });
    assert.equal(d.supplier.match, null); assert.equal(d.supplier.to_create, null);
    assert.equal(d.warnings.some((w) => w.code === "SUPPLIER_RUC_MISSING"), false, "un requerimiento no tiene proveedor");
    assert.equal(d.items[0].product_candidates[0].product.name, "COLA SINTETICA");
    assert.equal(d.items[0].suggested_product_id, String(d.items[0].product_candidates[0].product_id));
    assert.equal(d.items[1].suggested_product_id, String(partidaId));
    assert.equal(d.items[2].suggested_product_id, null);
    assert.ok(d.warnings.some((w) => w.code === "LINE_PRODUCT_UNMATCHED" && w.field === "items[2]"));
    const missing = d.warnings.filter((w) => w.code === "MISSING_FIELD").map((w) => w.field).sort();
    assert.deepEqual(missing, ["number", "requester", "requisition_date"]);
});

test("la sección (category) solo cuenta en un requerimiento: si la IA la 'adivina' en una guía, no baja el parecido con el catálogo", async () => {
    const guessed = [{ code: null, line_id: null, description: "Cemento Portland tipo I", unit: "bls", quantity: 2, unit_price: null, line_total: null, category: "partida" }];
    const guide = await draft("goods-receipt", { detected_type: "guia_remision", items: guessed });
    assert.equal(guide.items[0].suggested_product_id, String(cementId), "en una guía se ignora la categoría leída");
    assert.equal(guide.items[0].read.category, null);
});

test("COTIZACIÓN y ORDEN: la cotización sin número lo deja vacío; el proveedor de una orden es el destinatario", async () => {
    const quo = await draft("quotation", { detected_type: "cotizacion", number: null, series: null, valid_until: "2026-09-17", commercial_terms: "Oferta válida 7 días" });
    assert.equal(quo.draft.number, null);
    assert.ok(quo.warnings.some((w) => w.code === "MISSING_FIELD" && w.field === "number"));
    assert.equal(quo.draft.valid_until, "2026-09-17");
    const ord = await draft("purchase-order", { detected_type: "orden_compra", number: "00001", supplier: { ruc: "20123456789", name: "Cementos del Sur SAC" } });
    assert.equal(ord.draft.supplier_id, supplierId);
    assert.deepEqual([ord.draft.number, ord.draft.order_date], ["00001", "2026-09-10"]);
});

test("errores del archivo: otro módulo o proyecto, tipo no admitido, demasiado grande; sin permiso; IA sin configurar o caída", async () => {
    nextRead = read();
    const run = async (options, type = "invoice") => createDocumentDraftService(user, { projectId }, { file_id: await makeFile(options), document_type: type });
    await assert.rejects(run({ module: "metrados" }), codeOf("DOCUMENT_FILE_NOT_FOUND"));
    await assert.rejects(createDocumentDraftService(user, { projectId }, { file_id: 999999999, document_type: "invoice" }), codeOf("DOCUMENT_FILE_NOT_FOUND"));
    await assert.rejects(run({ mime: "text/plain" }), codeOf("DOCUMENT_DRAFT_FILE_TYPE_NOT_SUPPORTED"));
    await assert.rejects(run({ size: 16 * 1024 * 1024 }), codeOf("DOCUMENT_DRAFT_FILE_TOO_LARGE"));
    assert.equal((await run({ mime: "application/pdf" })).file_id.length > 0, true, "un PDF se admite");
    await assert.rejects(createDocumentDraftService({ ...user, user_id: outsiderId }, { projectId }, { file_id: await makeFile(), document_type: "invoice" }), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    // La IA cae: el error llega tal cual (el frontend ofrece llenar a mano).
    setDocumentReaderForTests({ read: async () => { const { AppError } = await import("../dist/models/errors/app-error.js"); const { DOCUMENT_DRAFT_ERRORS } = await import("../dist/models/errors/almacen/document-draft.errors.js"); throw new AppError(DOCUMENT_DRAFT_ERRORS.AI_UNAVAILABLE); } });
    await assert.rejects(run(), codeOf("DOCUMENT_DRAFT_AI_UNAVAILABLE"));
    // Sin motor simulado y sin clave: no está configurado.
    setDocumentReaderForTests(null);
    const key = process.env.GEMINI_API_KEY; delete process.env.GEMINI_API_KEY;
    try { await assert.rejects(run(), codeOf("DOCUMENT_DRAFT_AI_NOT_CONFIGURED")); } finally { if (key !== undefined) process.env.GEMINI_API_KEY = key; }
});
