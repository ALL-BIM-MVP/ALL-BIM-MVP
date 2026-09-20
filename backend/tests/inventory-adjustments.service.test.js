// inventory-adjustments.service.test.js
//
// Test de integración (BD real) de la Fase 10 de
// docs/almacen-ingreso-productos/05-roadmap.md: AJUSTES de inventario. Corrigen las
// cantidades de un ingreso o de un vale ya registrados SIN reescribirlos (el original queda
// igual; el ajuste es un documento nuevo, con motivo, que genera movimientos de Kardex),
// anulan un documento completo y permiten volver a registrar una guía anulada. Solo el
// Administrador del módulo (configure) ajusta. Invariante que se vigila en todo el test:
// stock por casilla = suma de sus movimientos. Corre contra dist/ ya compilado.
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
const kdxsvc = await import("../dist/services/almacen/inventory-movement.service.js");
const asvc = await import("../dist/services/almacen/inventory-adjustment.service.js");
const gisvc = await import("../dist/services/almacen/goods-issue.service.js");
const tsvc = await import("../dist/services/almacen/traceability.service.js");
const hsvc = await import("../dist/services/almacen/product-history.service.js");
const aschemas = await import("../dist/schemas/almacen/inventory-adjustment.schema.js");

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
const stockOf = async (product) => Number((await q(`SELECT COALESCE(SUM(quantity),0) AS t FROM bin_contents WHERE product_id = $1`, [product]))[0].t);
const binStock = async (bin, product) => Number((await q(`SELECT COALESCE(SUM(quantity),0) AS t FROM bin_contents WHERE bin_id = $1 AND product_id = $2`, [bin, product]))[0].t);
const movementsOf = async (product) => q(`SELECT type, quantity::float AS quantity, resulting_balance::float AS balance, reference_document_type, to_char(movement_date,'YYYY-MM-DD') AS date FROM inventory_movements WHERE product_id = $1 ORDER BY inventory_movement_id`, [product]);
const rparams = (id) => ({ projectId, goodsReceiptId: id });
const rcDetail = (rc) => rcsvc.getGoodsReceiptByIdService(owner(), rparams(rc.goods_receipt_id));
const fast = (number, product, qty, bin, over = {}) => rcsvc.createGoodsReceiptService(owner(), ctx(), {
    supplier_id: supplierA, entry_type: "rapida", delivery_note_series: "T001", delivery_note_number: number, delivery_note_date: "2026-09-10", received_date: "2026-09-12",
    items: [{ product_id: product, total_quantity: qty, locations: [{ bin_id: bin, quantity: qty }] }], ...over,
});
const issueOf = (product, qty, bin) => gisvc.createGoodsIssueService(owner(), ctx(), {
    number: vsn(), destination_sector: "Torre A", destination_level: "Piso 3", destination_block: "Bloque B", recipient_name: "Juan Pérez", recipient_dni: "12345678",
    issue_date: "2026-09-15", items: [{ product_id: product, total_quantity: qty, locations: [{ bin_id: bin, quantity: qty }] }],
});
const correct = (rc, lines, over = {}, user = owner()) => asvc.correctGoodsReceiptService(user, ctx(), rc.goods_receipt_id, {
    reason: "Error de digitación", items: lines.map(([item, bin, delta]) => ({ goods_receipt_item_id: item, bin_id: bin, quantity_delta: delta })), ...over });
const voidReceipt = (rc, over = {}, user = owner()) => asvc.voidGoodsReceiptService(user, ctx(), rc.goods_receipt_id, { reason: "Ingreso registrado por error", ...over });
// Invariante: el stock de cada casilla es la suma de sus movimientos (entradas - salidas).
const assertStockInvariant = async (label) => {
    const rows = await q(`SELECT bc.bin_id, bc.product_id, bc.quantity::float AS stock,
        COALESCE((SELECT SUM(CASE WHEN im.type = 'entrada' THEN im.quantity ELSE -im.quantity END) FROM inventory_movements im WHERE im.bin_id = bc.bin_id AND im.product_id = bc.product_id), 0)::float AS moved
        FROM bin_contents bc JOIN products p ON p.product_id = bc.product_id WHERE p.project_id = $1`, [projectId]);
    for (const r of rows) assert.equal(r.stock, r.moved, `${label}: casilla ${r.bin_id} producto ${r.product_id}`);
};

test("Zod: el motivo es obligatorio, el cambio no puede ser 0, una línea no se repite en la misma casilla y las fechas son AAAA-MM-DD", () => {
    const { CorrectGoodsReceiptBodySchema: R, CorrectGoodsIssueBodySchema: I, VoidDocumentBodySchema: V, ListAdjustmentsQuerySchema: L } = aschemas;
    const ok = { reason: "Error de digitación", items: [{ goods_receipt_item_id: 1, bin_id: 2, quantity_delta: 5 }] };
    assert.equal(R.safeParse(ok).success, true);
    assert.equal(R.safeParse({ ...ok, items: [{ goods_receipt_item_id: 1, bin_id: 2, quantity_delta: -5 }] }).success, true, "el cambio puede ser negativo");
    for (const reason of ["", "   ", undefined]) assert.equal(R.safeParse({ ...ok, reason }).success, false, `motivo: ${String(reason)}`);
    assert.equal(R.safeParse({ ...ok, reason: "x".repeat(501) }).success, false);
    assert.equal(R.safeParse({ ...ok, items: [{ goods_receipt_item_id: 1, bin_id: 2, quantity_delta: 0 }] }).success, false, "cambio 0");
    assert.equal(R.safeParse({ ...ok, items: [{ goods_receipt_item_id: 1, bin_id: 2, quantity_delta: 1e15 }] }).success, false);
    assert.equal(R.safeParse({ ...ok, items: [] }).success, false);
    assert.equal(R.safeParse({ ...ok, items: [ok.items[0], { ...ok.items[0], quantity_delta: 3 }] }).success, false, "misma línea y casilla dos veces");
    assert.equal(R.safeParse({ ...ok, items: [ok.items[0], { goods_receipt_item_id: 1, bin_id: 3, quantity_delta: 3 }] }).success, true, "la misma línea en otra casilla sí");
    assert.equal(R.safeParse({ ...ok, adjustment_date: "2026-09-20" }).success, true);
    assert.equal(R.safeParse({ ...ok, adjustment_date: "20/09/2026" }).success, false);
    assert.equal(I.safeParse({ reason: "x", items: [{ goods_issue_item_id: 1, bin_id: 2, quantity_delta: -2 }] }).success, true);
    assert.equal(I.safeParse({ reason: "x", items: [{ goods_receipt_item_id: 1, bin_id: 2, quantity_delta: -2 }] }).success, false, "un vale usa goods_issue_item_id");
    assert.equal(V.safeParse({ reason: "Se registró por error" }).success, true);
    assert.equal(V.safeParse({}).success, false);
    assert.equal(L.safeParse({ kind: "correccion", goods_receipt_id: "3" }).success, true);
    assert.equal(L.safeParse({ kind: "otra" }).success, false);
});

test("CORREGIR UNA CANTIDAD: se registró 79 y eran 97 → ajuste de +18; el original NO cambia, lo efectivo es 97 y el Kardex deja su rastro", async () => {
    S.rc1 = await fast("1", productId, 79, binA);
    const item = S.rc1.items[0].goods_receipt_item_id;
    assert.equal(await stockOf(productId), 79);
    const adj = await correct(S.rc1, [[item, binA, 18]], { adjustment_date: "2026-09-20" });
    assert.equal(adj.kind, "correccion");
    assert.equal(adj.reason, "Error de digitación");
    assert.equal(adj.adjustment_date, "2026-09-20");
    assert.equal(adj.reference_document.type, "goods_receipt");
    assert.equal(adj.reference_document.label, "T001-1");
    assert.equal(adj.items.length, 1);
    assert.equal(adj.items[0].quantity_delta, "18.000000");
    assert.equal(adj.items[0].stock_effect, "18.000000");
    assert.equal(adj.items[0].product.code, "T-1");
    assert.equal(await stockOf(productId), 97, "el stock refleja el ajuste");
    assert.equal(await binStock(binA, productId), 97);

    const detail = await rcDetail(S.rc1);
    const line = detail.items[0];
    assert.equal(String(line.total_quantity), "79.000000", "lo REGISTRADO no se reescribe");
    assert.equal(line.adjusted_quantity, "18.000000");
    assert.equal(line.effective_quantity, "97.000000");
    assert.deepEqual(line.effective_locations.map((l) => [l.bin_id === binA, l.quantity]), [[true, "97.000000"]]);
    assert.equal(String(line.locations[0].quantity), "79.000000", "las casillas originales tampoco");
    assert.deepEqual(line.adjustments.map((a) => [a.kind, a.quantity_delta, a.reason]), [["correccion", "18.000000", "Error de digitación"]]);
    assert.equal(detail.voided, false);

    const kardex = await movementsOf(productId);
    assert.deepEqual(kardex, [
        { type: "entrada", quantity: 79, balance: 79, reference_document_type: "goods_receipt", date: "2026-09-12" },
        { type: "entrada", quantity: 18, balance: 97, reference_document_type: "inventory_adjustment", date: "2026-09-20" }]);
    await assertStockInvariant("después de corregir");
});

test("una corrección a la baja, y mover lo recibido a OTRA casilla (−20 en una y +20 en otra: cambia las casillas, no la cantidad)", async () => {
    const item = S.rc1.items[0].goods_receipt_item_id;
    await correct(S.rc1, [[item, binA, -7]], { reason: "Se contó de más" });
    assert.equal((await rcDetail(S.rc1)).items[0].effective_quantity, "90.000000");
    assert.equal(await stockOf(productId), 90);
    // Se había ubicado en la casilla equivocada: 20 pasan de A1 a A2.
    const move = await correct(S.rc1, [[item, binA, -20], [item, binB, 20]], { reason: "Se guardó en la casilla equivocada" });
    assert.equal(move.items.length, 2);
    const line = (await rcDetail(S.rc1)).items[0];
    assert.equal(line.effective_quantity, "90.000000", "la cantidad efectiva no cambia al mover");
    assert.deepEqual(line.effective_locations.map((l) => [l.bin_id === binA ? "A" : "B", l.quantity]).sort(), [["A", "70.000000"], ["B", "20.000000"]]);
    assert.equal(await binStock(binA, productId), 70);
    assert.equal(await binStock(binB, productId), 20);
    assert.equal(line.adjustments.length, 4, "+18, −7 y las dos líneas del movimiento (−20 / +20)");
    await assertStockInvariant("después de mover");
});

test("reglas: lo efectivo de una línea en una casilla nunca es negativo, la línea debe ser del documento y la casilla del proyecto", async () => {
    const item = S.rc1.items[0].goods_receipt_item_id;
    const before = [await stockOf(productId), (await q(`SELECT COUNT(*)::int AS n FROM inventory_adjustments WHERE project_id = $1`, [projectId]))[0].n];
    await assert.rejects(correct(S.rc1, [[item, binA, -200]]), codeOf("INVENTORY_ADJUSTMENT_EFFECTIVE_BELOW_ZERO"), "más de lo que hay de esa línea en la casilla");
    await assert.rejects(correct(S.rc1, [[item, binB, -25]]), codeOf("INVENTORY_ADJUSTMENT_EFFECTIVE_BELOW_ZERO"));
    const other = await fast("2", productY, 5, binA);
    await assert.rejects(correct(S.rc1, [[other.items[0].goods_receipt_item_id, binA, 1]]), codeOf("INVENTORY_ADJUSTMENT_ITEM_NOT_IN_DOCUMENT"), "línea de otro ingreso");
    await assert.rejects(correct(S.rc1, [[999999999, binA, 1]]), codeOf("INVENTORY_ADJUSTMENT_ITEM_NOT_IN_DOCUMENT"));
    await assert.rejects(correct(S.rc1, [[item, 999999999, 1]]), codeOf("BIN_NOT_FOUND"));
    await assert.rejects(asvc.correctGoodsReceiptService(owner(), { projectId: otherProjectId }, S.rc1.goods_receipt_id, { reason: "x", items: [{ goods_receipt_item_id: item, bin_id: binA, quantity_delta: 1 }] }), codeOf("GOODS_RECEIPT_NOT_FOUND"), "documento de otro proyecto");
    // Un ajuste con una línea buena y una mala no deja NADA a medias.
    await assert.rejects(correct(S.rc1, [[item, binA, 5], [item, binB, -999]]), codeOf("INVENTORY_ADJUSTMENT_EFFECTIVE_BELOW_ZERO"));
    assert.deepEqual([await stockOf(productId), (await q(`SELECT COUNT(*)::int AS n FROM inventory_adjustments WHERE project_id = $1`, [projectId]))[0].n], before, "ni stock ni ajustes a medias");
    S.rc2 = other;
});

test("el stock nunca queda negativo: si el material ya salió, no se puede bajar ni anular el ingreso (y no queda nada a medias)", async () => {
    const item = S.rc1.items[0].goods_receipt_item_id;
    // Salen 60 de la casilla A por un vale: en A quedan 10 (de los 70).
    S.issue1 = await issueOf(productId, 60, binA);
    assert.equal(await binStock(binA, productId), 10);
    const before = [await stockOf(productId), (await movementsOf(productId)).length];
    await assert.rejects(correct(S.rc1, [[item, binA, -30]]), codeOf("INSUFFICIENT_STOCK"), "bajar 30 en A dejaría la casilla en negativo");
    await assert.rejects(voidReceipt(S.rc1), codeOf("INSUFFICIENT_STOCK"), "no se anula un ingreso cuyo material ya salió");
    assert.equal((await rcDetail(S.rc1)).voided, false);
    assert.deepEqual([await stockOf(productId), (await movementsOf(productId)).length], before, "sin cambios");
    await assertStockInvariant("con el material fuera");
});

test("CORREGIR UN VALE: se retiraron 60 pero eran 40 → el ajuste devuelve 20 al stock; retirar de más lo baja", async () => {
    const gi = { projectId, goodsIssueId: S.issue1.goods_issue_id };
    const item = S.issue1.items[0].goods_issue_item_id;
    const adj = await asvc.correctGoodsIssueService(owner(), ctx(), S.issue1.goods_issue_id, {
        reason: "Solo se retiraron 40", items: [{ goods_issue_item_id: item, bin_id: binA, quantity_delta: -20 }] });
    assert.equal(adj.reference_document.label, S.issue1.number);
    assert.equal(adj.items[0].quantity_delta, "-20.000000", "cambio de lo retirado");
    assert.equal(adj.items[0].stock_effect, "20.000000", "el efecto en el stock es el opuesto");
    assert.equal(await binStock(binA, productId), 30, "10 + 20 devueltos");
    const detail = await gisvc.getGoodsIssueByIdService(owner(), gi);
    assert.equal(String(detail.items[0].total_quantity), "60.000000", "lo registrado en el vale no cambia");
    assert.equal(detail.items[0].adjusted_quantity, "-20.000000");
    assert.equal(detail.items[0].effective_quantity, "40.000000");
    assert.deepEqual(detail.items[0].effective_locations.map((l) => l.quantity), ["40.000000"]);
    // Retirar de más: +5 lo retirado → -5 de stock.
    await asvc.correctGoodsIssueService(owner(), ctx(), S.issue1.goods_issue_id, { reason: "Se llevaron 5 más", items: [{ goods_issue_item_id: item, bin_id: binA, quantity_delta: 5 }] });
    assert.equal(await binStock(binA, productId), 25);
    assert.equal((await gisvc.getGoodsIssueByIdService(owner(), gi)).items[0].effective_quantity, "45.000000");
    // No se puede devolver más de lo que se retiró en esa casilla.
    await assert.rejects(asvc.correctGoodsIssueService(owner(), ctx(), S.issue1.goods_issue_id, { reason: "x", items: [{ goods_issue_item_id: item, bin_id: binA, quantity_delta: -100 }] }), codeOf("INVENTORY_ADJUSTMENT_EFFECTIVE_BELOW_ZERO"));
    await assertStockInvariant("después de corregir el vale");
});

test("ANULAR UN INGRESO: revierte su stock, queda marcado, ya no se edita y su GUÍA SE PUEDE VOLVER A REGISTRAR", async () => {
    const wrong = await fast("10", productY, 50, binB);
    await correct(wrong, [[wrong.items[0].goods_receipt_item_id, binB, 10]], { reason: "Eran 60" });
    const stockBefore = await stockOf(productY);
    const voided = await voidReceipt(wrong, { reason: "Era otro proveedor" });
    assert.equal(voided.kind, "anulacion");
    assert.equal(voided.items.length, 1, "una línea por casilla con stock efectivo");
    assert.equal(voided.items[0].quantity_delta, "-60.000000", "revierte lo EFECTIVO (50 + 10 de la corrección)");
    assert.equal(await stockOf(productY), stockBefore - 60);
    const detail = await rcDetail(wrong);
    assert.equal(detail.voided, true);
    assert.ok(detail.voided_at);
    assert.equal(detail.items[0].effective_quantity, "0.000000");
    assert.deepEqual(detail.items[0].effective_locations, []);
    assert.equal(String(detail.items[0].total_quantity), "50.000000", "el original queda tal cual");
    assert.deepEqual(detail.alerts, [], "un ingreso anulado ya no espera documentos");
    // Ya no admite cambios.
    await assert.rejects(voidReceipt(wrong), codeOf("INVENTORY_ADJUSTMENT_ALREADY_VOIDED"));
    await assert.rejects(correct(wrong, [[wrong.items[0].goods_receipt_item_id, binB, 1]]), codeOf("INVENTORY_ADJUSTMENT_ALREADY_VOIDED"));
    await assert.rejects(rcsvc.updateGoodsReceiptService(asUser(editorId), rparams(wrong.goods_receipt_id), { delivery_note_number: "11" }), codeOf("GOODS_RECEIPT_ALREADY_VOIDED"));
    await assert.rejects(rcsvc.setGoodsReceiptFileService(asUser(editorId), rparams(wrong.goods_receipt_id), { file_id: null }), codeOf("GOODS_RECEIPT_ALREADY_VOIDED"));
    await assert.rejects(rcsvc.linkGoodsReceiptPurchaseOrderService(asUser(editorId), rparams(wrong.goods_receipt_id), { purchase_order_id: 1, items: [{ goods_receipt_item_id: 1, purchase_order_item_id: 1 }] }), codeOf("GOODS_RECEIPT_ALREADY_VOIDED"));
    // La guía anulada se vuelve a registrar bien (mismo proveedor, serie y número).
    const again = await fast("10", productY, 60, binB);
    assert.equal(again.delivery_note_number, "10");
    // Pero una guía VIGENTE sigue sin poder repetirse.
    await assert.rejects(fast("10", productY, 1, binB), codeOf("GOODS_RECEIPT_DUPLICATE_DELIVERY_NOTE"));
    S.wrong = wrong; S.again = again;
    await assertStockInvariant("después de anular");
});

test("anular un ingreso sin nada efectivo que revertir se rechaza; anular un VALE devuelve todo su material", async () => {
    const empty = await fast("20", productY, 5, binA);
    await correct(empty, [[empty.items[0].goods_receipt_item_id, binA, -5]], { reason: "Se registró sin haber llegado" });
    await assert.rejects(voidReceipt(empty), codeOf("INVENTORY_ADJUSTMENT_NOTHING_TO_VOID"));
    const stockBefore = await stockOf(productY);
    const issue = await issueOf(productY, 30, binB);
    assert.equal(await stockOf(productY), stockBefore - 30);
    const voided = await asvc.voidGoodsIssueService(owner(), ctx(), issue.goods_issue_id, { reason: "El vale se emitió por error" });
    assert.equal(voided.items[0].quantity_delta, "-30.000000");
    assert.equal(voided.items[0].stock_effect, "30.000000", "el material vuelve al stock");
    assert.equal(await stockOf(productY), stockBefore);
    const detail = await gisvc.getGoodsIssueByIdService(owner(), { projectId, goodsIssueId: issue.goods_issue_id });
    assert.equal(detail.voided, true);
    assert.equal(detail.items[0].effective_quantity, "0.000000");
    await assert.rejects(asvc.voidGoodsIssueService(owner(), ctx(), issue.goods_issue_id, { reason: "otra vez" }), codeOf("INVENTORY_ADJUSTMENT_ALREADY_VOIDED"));
    await assert.rejects(asvc.correctGoodsIssueService(owner(), ctx(), issue.goods_issue_id, { reason: "x", items: [{ goods_issue_item_id: issue.items[0].goods_issue_item_id, bin_id: binB, quantity_delta: 1 }] }), codeOf("INVENTORY_ADJUSTMENT_ALREADY_VOIDED"));
    await assertStockInvariant("después de anular el vale");
});

test("permisos: solo el Administrador del módulo (configure) ajusta; un Editor y un miembro sin rol no; consultar es de lectura", async () => {
    const item = S.rc1.items[0].goods_receipt_item_id;
    for (const user of [asUser(editorId), asUser(plainId)]) {
        await assert.rejects(correct(S.rc1, [[item, binA, 1]], {}, user), codeOf("INSUFFICIENT_PERMISSIONS"));
        await assert.rejects(voidReceipt(S.rc2, {}, user), codeOf("INSUFFICIENT_PERMISSIONS"));
        await assert.rejects(asvc.correctGoodsIssueService(user, ctx(), S.issue1.goods_issue_id, { reason: "x", items: [{ goods_issue_item_id: S.issue1.items[0].goods_issue_item_id, bin_id: binA, quantity_delta: 1 }] }), codeOf("INSUFFICIENT_PERMISSIONS"));
        await assert.rejects(asvc.voidGoodsIssueService(user, ctx(), S.issue1.goods_issue_id, { reason: "x" }), codeOf("INSUFFICIENT_PERMISSIONS"));
    }
    await assert.rejects(correct(S.rc1, [[item, binA, 1]], {}, asUser(outsiderId)), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    const list = await asvc.listAdjustmentsService(asUser(plainId), ctx(), {});
    assert.ok(list.length >= 6, "un miembro con solo lectura puede consultar los ajustes");
    await assert.rejects(asvc.listAdjustmentsService(asUser(outsiderId), ctx(), {}), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
});

test("consulta: listar y filtrar los ajustes por documento y tipo; el detalle respeta el proyecto", async () => {
    const all = await asvc.listAdjustmentsService(owner(), ctx(), {});
    const onRc1 = await asvc.listAdjustmentsService(owner(), ctx(), { goods_receipt_id: S.rc1.goods_receipt_id });
    assert.equal(onRc1.length, 3, "las tres correcciones del ingreso 1");
    assert.ok(onRc1.every((a) => a.reference_document.id === S.rc1.goods_receipt_id && a.kind === "correccion"));
    assert.equal((await asvc.listAdjustmentsService(owner(), ctx(), { goods_issue_id: S.issue1.goods_issue_id })).length, 2);
    const voids = await asvc.listAdjustmentsService(owner(), ctx(), { kind: "anulacion" });
    assert.equal(voids.length, 2, "el ingreso anulado y el vale anulado");
    assert.ok(all.length > voids.length);
    const one = await asvc.getAdjustmentByIdService(owner(), { projectId, adjustmentId: onRc1[0].inventory_adjustment_id });
    assert.equal(one.items.length, onRc1[0].items.length);
    await assert.rejects(asvc.getAdjustmentByIdService(owner(), { projectId: otherProjectId, adjustmentId: one.inventory_adjustment_id }), codeOf("INVENTORY_ADJUSTMENT_NOT_FOUND"));
    await assert.rejects(asvc.getAdjustmentByIdService(owner(), { projectId, adjustmentId: 999999999 }), codeOf("INVENTORY_ADJUSTMENT_NOT_FOUND"));
});

test("la cadena de documentos usa lo EFECTIVO: el ajuste sube lo recibido de la línea de orden y anular el ingreso lo deja en cero y libera la orden", async () => {
    const po = await psvc.createPurchaseOrderService(owner(), ctx(), { supplier_id: supplierA, number: "OC-A", order_date: "2026-09-15", currency: "PEN",
        items: [{ product_id: productId, description: "Cemento", quantity_ordered: 100, line_total: 1000 }] });
    const poItem = po.items[0].purchase_order_item_id;
    const rc = await rcsvc.createGoodsReceiptService(owner(), ctx(), { supplier_id: supplierA, entry_type: "normal", purchase_order_id: po.purchase_order_id,
        delivery_note_series: "T001", delivery_note_number: "30", delivery_note_date: "2026-09-16", received_date: "2026-09-17",
        items: [{ purchase_order_item_id: poItem, total_quantity: 60, locations: [{ bin_id: binB, quantity: 60 }] }] });
    const status = async () => (await psvc.getPurchaseOrderByIdService(owner(), { projectId, purchaseOrderId: po.purchase_order_id })).items[0].progress;
    assert.equal((await status()).received, "60.000000");
    await correct(rc, [[rc.items[0].goods_receipt_item_id, binB, 40]], { reason: "Llegaron 100, se digitó 60" });
    assert.equal((await status()).received, "100.000000", "lo recibido es lo efectivo");
    assert.equal((await status()).pending_to_receive, "0.000000");
    // Con un ingreso vigente la orden no se da de baja ni cambia su cantidad.
    await assert.rejects(psvc.deletePurchaseOrderService(owner(), { projectId, purchaseOrderId: po.purchase_order_id }), codeOf("PURCHASE_ORDER_HAS_DOCUMENTS"));
    await assert.rejects(psvc.updatePurchaseOrderItemService(owner(), { projectId, purchaseOrderId: po.purchase_order_id, itemId: poItem }, { quantity_ordered: 90 }), codeOf("PURCHASE_ORDER_ITEM_LOCKED"));
    // Trazabilidad: lo registrado, el ajuste y lo efectivo, con sus casillas.
    const trace = await tsvc.getTraceabilityService(owner(), { projectId, documentType: "goods-receipt", documentId: rc.goods_receipt_id }, { direction: "backward" });
    const rline = trace.threads[0].receipt_items[0];
    assert.deepEqual([rline.quantity_registered, rline.quantity_adjusted, rline.quantity_received], ["60.000000", "40.000000", "100.000000"]);
    assert.deepEqual(rline.locations.map((l) => l.quantity), ["100.000000"]);
    assert.equal(trace.documents.goods_receipts[0].voided, false);
    // Se anula el ingreso: lo recibido vuelve a cero y la orden queda libre.
    await voidReceipt(rc, { reason: "Se registró contra la orden equivocada" });
    assert.equal((await status()).received, "0.000000");
    const voidedTrace = await tsvc.getTraceabilityService(owner(), { projectId, documentType: "goods-receipt", documentId: rc.goods_receipt_id }, { direction: "backward" });
    assert.equal(voidedTrace.documents.goods_receipts[0].voided, true);
    assert.deepEqual(voidedTrace.threads[0].receipt_items[0].locations, []);
    await psvc.updatePurchaseOrderItemService(owner(), { projectId, purchaseOrderId: po.purchase_order_id, itemId: poItem }, { quantity_ordered: 90 });
    await psvc.deletePurchaseOrderService(owner(), { projectId, purchaseOrderId: po.purchase_order_id });
    await assertStockInvariant("con la orden");
});

test("la hoja de vida y el Kardex muestran los ajustes dentro del ingreso o del vale que corrigen, con su motivo", async () => {
    const h = await hsvc.getProductHistoryService(owner(), { projectId, productId }, {});
    const entryOf = (label) => h.items.find((i) => i.type === "entrada" && i.status === "recibido" && i.label === label);
    const receipt = entryOf("T001-1");
    assert.equal(receipt.quantity_registered, "79.000000", "el ingreso original se sigue viendo como se registró");
    const corrected = receipt.adjustments.find((a) => a.reason === "Error de digitación");
    assert.equal(corrected.kind, "correccion");
    assert.match(corrected.label, /^Ajuste #\d+$/);
    assert.equal(corrected.items[0].quantity_delta, "18.000000");
    assert.equal(corrected.items[0].stock_effect, "18.000000");
    assert.equal(receipt.quantity_effective, String((Number(receipt.quantity_registered) + Number(receipt.quantity_adjusted)).toFixed(6)));
    assert.ok(h.items.some((i) => i.type === "entrada" && i.voided && i.adjustments.some((a) => a.kind === "anulacion")), "un ingreso anulado se ve como anulado, con su ajuste");
    const issue = h.items.find((i) => i.type === "salida" && i.adjustments.some((a) => a.reason === "Solo se retiraron 40"));
    const onIssue = issue.adjustments.find((a) => a.reason === "Solo se retiraron 40");
    assert.equal(onIssue.items[0].quantity_delta, "-20.000000");
    assert.equal(onIssue.items[0].stock_effect, "20.000000", "devolver lo retirado de más es una entrada de stock");
    assert.equal(issue.quantity_effective, String((Number(issue.quantity_registered) + Number(issue.quantity_adjusted)).toFixed(6)));
    // El Kardex lista los movimientos de ajuste con su referencia.
    const kardex = await kdxsvc.listInventoryMovementsService(owner(), ctx(), { product_id: productId });
    assert.ok(kardex.some((m) => m.reference_document_type === "inventory_adjustment"));
    // Todos los saldos de la hoja de vida (ubicaciones y ajustes) siguen siendo los del Kardex.
    const balances = h.items.flatMap((i) => [...i.locations.map((l) => Number(l.balance_after)), ...i.adjustments.flatMap((a) => a.items.map((x) => Number(x.balance_after)))])
        .sort((x, y) => x - y);
    assert.deepEqual(balances, kardex.map((k) => Number(k.resulting_balance)).sort((x, y) => x - y));
    assert.equal(h.stock.total, String((await stockOf(productId)).toFixed(6)));
    await assertStockInvariant("hoja de vida");
});

test("vaciar Almacén elimina los ajustes antes que los documentos que corrigen", async () => {
    const counts = await emptyAlmacenContentService(owner(), ctx());
    assert.ok(counts.inventory_adjustments >= 10);
    assert.equal((await q(`SELECT COUNT(*)::int AS n FROM inventory_adjustments WHERE project_id = $1`, [projectId]))[0].n, 0);
    assert.equal((await q(`SELECT COUNT(*)::int AS n FROM inventory_adjustment_items WHERE bin_id IN (SELECT bin_id FROM bins WHERE bin_id = $1 OR bin_id = $2)`, [binA, binB]))[0].n, 0);
});
