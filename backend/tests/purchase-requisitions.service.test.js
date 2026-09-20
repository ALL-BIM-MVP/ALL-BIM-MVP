// purchase-requisitions.service.test.js
//
// Test de integración (BD real) de la Fase 3 de
// docs/almacen-ingreso-productos/05-roadmap.md: requerimientos con sus
// líneas (PATCH parcial), el archivo físico adjunto (reemplazo/quitar/baja
// eliminan el archivo anterior), permisos y vaciar Almacén. Corre contra
// dist/ ya compilado, sin mocks del driver.
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
const svc = await import("../dist/services/almacen/purchase-requisition.service.js");
const { deleteFileService } = await import("../dist/services/files.service.js");
const schemas = await import("../dist/schemas/almacen/purchase-requisition.schema.js");

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

const body = (overrides = {}) => ({
    number: "REQ-001",
    requisition_date: "2026-09-10",
    requester: "Almacenero de obra",
    items: [
        { product_id: productId, description: "Cemento Sol tipo I", quantity_requested: 50, estimated_unit_price: 30 },
        { product_id: productId, description: "Cemento Sol bolsa 42.5 kg (como dice el papel)", quantity_requested: 10 },
    ],
    ...overrides,
});
const params = (id, extra = {}) => ({ projectId, purchaseRequisitionId: id, ...extra });

test("Zod: crear exige líneas, fecha AAAA-MM-DD, número y cantidad positiva; PATCH exige al menos un campo", () => {
    const { CreatePurchaseRequisitionBodySchema: Create, UpdatePurchaseRequisitionBodySchema: Patch,
        UpdatePurchaseRequisitionItemBodySchema: PatchItem, SetPurchaseRequisitionFileBodySchema: SetFile } = schemas;
    assert.equal(Create.safeParse(body()).success, true);
    assert.equal(Create.safeParse(body({ items: [] })).success, false, "sin líneas");
    assert.equal(Create.safeParse(body({ requisition_date: "10/09/2026" })).success, false);
    assert.equal(Create.safeParse(body({ number: "  " })).success, false);
    assert.equal(Create.safeParse(body({ items: [{ product_id: 1, description: "x", quantity_requested: 0 }] })).success, false, "cantidad 0");
    assert.equal(Create.safeParse(body({ items: [{ product_id: 1, description: "x", quantity_requested: 1e15 }] })).success, false, "desborda NUMERIC");
    assert.equal(Create.safeParse(body({ items: [{ product_id: 1, description: " ", quantity_requested: 1 }] })).success, false);
    for (const missing of [undefined, null, 0, "abc"]) {
        assert.equal(
            Create.safeParse(body({ items: [{ product_id: missing, description: "x", quantity_requested: 1 }] })).success,
            false, `product_id obligatorio: ${String(missing)}`
        );
    }
    assert.equal(PatchItem.safeParse({ product_id: null }).success, false, "una línea no puede quedar sin producto");

    assert.equal(Patch.safeParse({}).success, false, "PATCH vacío");
    assert.equal(Patch.safeParse({ requester: "Otro" }).success, true);
    assert.equal(Patch.safeParse({ notes: null }).success, true, "notes null limpia la observación");
    assert.equal(Patch.safeParse({ requisition_date: "2026-13-40" }).success, false);
    assert.equal(PatchItem.safeParse({}).success, false);
    assert.equal(PatchItem.safeParse({ quantity_requested: 5 }).success, true);
    assert.equal(SetFile.safeParse({}).success, false, "file_id es obligatorio (o null)");
    assert.equal(SetFile.safeParse({ file_id: null }).success, true);
});

test("crear: cabecera + líneas en una transacción; el detalle trae producto, fecha como texto y sin archivo", async () => {
    const created = await svc.createPurchaseRequisitionService(asUser(OWNER_USER_ID), { projectId }, body());
    state.req = created;
    assert.equal(created.number, "REQ-001");
    assert.equal(created.requisition_date, "2026-09-10", "fecha sin hora como texto, sin desfase");
    assert.equal(created.file, null);
    assert.equal(created.items.length, 2);
    assert.equal(created.items[0].product.code, "T-1");
    assert.equal(String(created.items[1].product.product_id), String(created.items[1].product_id), "toda línea trae su producto");
    assert.notEqual(created.items[1].description, created.items[1].product.name, "la descripción es el texto del papel, distinto del catálogo");
    assert.equal(created.items[0].estimated_unit_price, "30.000000");
    assert.equal(created.items[1].estimated_unit_price, null);
    state.itemA = created.items[0].purchase_requisition_item_id;
    state.itemB = created.items[1].purchase_requisition_item_id;
});

test("crear: número repetido 409; producto de otro proyecto 404 y no queda nada a medias", async () => {
    await assert.rejects(
        svc.createPurchaseRequisitionService(asUser(OWNER_USER_ID), { projectId }, body()),
        codeOf("PURCHASE_REQUISITION_DUPLICATE_NUMBER")
    );
    await assert.rejects(
        svc.createPurchaseRequisitionService(asUser(OWNER_USER_ID), { projectId }, body({
            number: "REQ-XX", items: [{ product_id: otherProductId, description: "x", quantity_requested: 1 }],
        })),
        codeOf("PRODUCT_NOT_FOUND")
    );
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM purchase_requisitions WHERE project_id = $1`, [projectId]);
    assert.equal(n, 1, "solo el primero: el fallido no dejó cabecera");
});

test("listar y buscar por número o solicitante (sin comodines); trae conteo de líneas y has_file", async () => {
    await svc.createPurchaseRequisitionService(asUser(OWNER_USER_ID), { projectId }, body({
        number: "RQ-2026-0034", requester: "Ing. Residente", items: [{ product_id: productId, description: "Arena gruesa", quantity_requested: 3 }],
    }));
    const all = await svc.listPurchaseRequisitionsService(asUser(plainId), { projectId }, {});
    assert.equal(all.length, 2);
    const first = all.find((r) => r.number === "REQ-001");
    assert.equal(first.items_count, 2);
    assert.equal(first.has_file, false);
    assert.deepEqual((await svc.listPurchaseRequisitionsService(asUser(plainId), { projectId }, { search: "0034" })).map((r) => r.number), ["RQ-2026-0034"]);
    assert.deepEqual((await svc.listPurchaseRequisitionsService(asUser(plainId), { projectId }, { search: "residente" })).map((r) => r.number), ["RQ-2026-0034"]);
    assert.equal((await svc.listPurchaseRequisitionsService(asUser(plainId), { projectId }, { search: "%" })).length, 0, "% no es comodín");
});

test("PATCH cabecera: solo cambia lo enviado; notes null limpia; número repetido 409", async () => {
    const id = state.req.purchase_requisition_id;
    const a = await svc.updatePurchaseRequisitionService(asUser(editorId), params(id), { requester: "Otro solicitante", notes: "urgente" });
    assert.equal(a.requester, "Otro solicitante");
    assert.equal(a.notes, "urgente");
    assert.equal(a.number, "REQ-001", "lo no enviado no se toca");
    assert.equal(a.requisition_date, "2026-09-10");
    assert.equal(a.updated_by, editorId);
    const b = await svc.updatePurchaseRequisitionService(asUser(editorId), params(id), { notes: null });
    assert.equal(b.notes, null);
    assert.equal(b.requester, "Otro solicitante");
    await assert.rejects(
        svc.updatePurchaseRequisitionService(asUser(editorId), params(id), { number: "RQ-2026-0034" }),
        codeOf("PURCHASE_REQUISITION_DUPLICATE_NUMBER")
    );
});

test("líneas: agregar, PATCH parcial y quitar; los ids de las demás líneas no cambian; la última no se quita", async () => {
    const id = state.req.purchase_requisition_id;
    const added = await svc.addPurchaseRequisitionItemService(asUser(editorId), params(id), { product_id: productId, description: "Alambre N°16", quantity_requested: 2 });
    assert.equal(added.items.length, 3);
    const itemC = added.items[2].purchase_requisition_item_id;

    const patched = await svc.updatePurchaseRequisitionItemService(asUser(editorId), params(id, { itemId: state.itemA }), { quantity_requested: 60 });
    const a = patched.items.find((i) => i.purchase_requisition_item_id === state.itemA);
    assert.equal(a.quantity_requested, "60.000000");
    assert.equal(a.description, "Cemento Sol tipo I", "lo no enviado no se toca");
    assert.equal(a.estimated_unit_price, "30.000000");
    assert.deepEqual(patched.items.map((i) => i.purchase_requisition_item_id), [state.itemA, state.itemB, itemC], "ids estables");

    const cleared = await svc.updatePurchaseRequisitionItemService(asUser(editorId), params(id, { itemId: state.itemA }), { estimated_unit_price: null });
    const a2 = cleared.items.find((i) => i.purchase_requisition_item_id === state.itemA);
    assert.equal(a2.estimated_unit_price, null);
    assert.equal(String(a2.product.product_id), String(a.product.product_id), "el producto no cambia si no se envía");

    await assert.rejects(
        svc.updatePurchaseRequisitionItemService(asUser(editorId), params(id, { itemId: state.itemA }), { product_id: otherProductId }),
        codeOf("PRODUCT_NOT_FOUND")
    );
    await assert.rejects(
        svc.updatePurchaseRequisitionItemService(asUser(editorId), params(id, { itemId: 999999999 }), { quantity_requested: 1 }),
        codeOf("PURCHASE_REQUISITION_ITEM_NOT_FOUND")
    );

    const after1 = await svc.deletePurchaseRequisitionItemService(asUser(editorId), params(id, { itemId: itemC }));
    assert.equal(after1.items.length, 2);
    await svc.deletePurchaseRequisitionItemService(asUser(editorId), params(id, { itemId: state.itemB }));
    await assert.rejects(
        svc.deletePurchaseRequisitionItemService(asUser(editorId), params(id, { itemId: state.itemA })),
        codeOf("PURCHASE_REQUISITION_LAST_ITEM")
    );
});

test("una línea de OTRO requerimiento no se toca desde este (404)", async () => {
    const other = (await svc.listPurchaseRequisitionsService(asUser(OWNER_USER_ID), { projectId }, { search: "0034" }))[0];
    await assert.rejects(
        svc.updatePurchaseRequisitionItemService(asUser(editorId), params(other.purchase_requisition_id, { itemId: state.itemA }), { quantity_requested: 1 }),
        codeOf("PURCHASE_REQUISITION_ITEM_NOT_FOUND")
    );
});

test("archivo: adjuntar, no repetir en otro documento, solo de Almacén y del mismo proyecto", async () => {
    const id = state.req.purchase_requisition_id;
    const f1 = await makeFile(projectId);
    state.f1 = f1;
    const withFile = await svc.setPurchaseRequisitionFileService(asUser(editorId), params(id), { file_id: f1.fileId });
    assert.equal(withFile.file.file_id, f1.fileId);
    assert.match(withFile.file.url, /^\/files\/\d+\/content\?token=/);
    assert.equal((await svc.listPurchaseRequisitionsService(asUser(plainId), { projectId }, { search: "REQ-001" }))[0].has_file, true);

    const otherId = (await svc.listPurchaseRequisitionsService(asUser(OWNER_USER_ID), { projectId }, { search: "0034" }))[0].purchase_requisition_id;
    await assert.rejects(
        svc.setPurchaseRequisitionFileService(asUser(editorId), params(otherId), { file_id: f1.fileId }),
        codeOf("DOCUMENT_FILE_ALREADY_ATTACHED")
    );
    const metrados = await makeFile(projectId, "metrados");
    const foreign = await makeFile(otherProjectId);
    for (const f of [metrados, foreign]) {
        await assert.rejects(
            svc.setPurchaseRequisitionFileService(asUser(editorId), params(otherId), { file_id: f.fileId }),
            codeOf("DOCUMENT_FILE_NOT_FOUND")
        );
    }
    await assert.rejects(
        svc.setPurchaseRequisitionFileService(asUser(editorId), params(otherId), { file_id: 999999999 }),
        codeOf("DOCUMENT_FILE_NOT_FOUND")
    );
    state.otherId = otherId;
    state.metrados = metrados;
    state.foreign = foreign;
});

test("archivo en uso: DELETE /files/:id se rechaza (409) y el archivo sigue existiendo", async () => {
    await assert.rejects(
        deleteFileService(asUser(OWNER_USER_ID), { projectId, fileId: state.f1.fileId }),
        codeOf("FILE_IN_USE")
    );
    assert.equal(await fileRowExists(state.f1.fileId), true);
    assert.equal(fs.existsSync(state.f1.filePath), true);
});

test("reemplazar el archivo elimina el anterior (fila y bytes); repetir el mismo no cambia nada", async () => {
    const id = state.req.purchase_requisition_id;
    const f2 = await makeFile(projectId);
    const same = await svc.setPurchaseRequisitionFileService(asUser(editorId), params(id), { file_id: state.f1.fileId });
    assert.equal(same.file.file_id, state.f1.fileId, "mismo archivo: no-op");
    assert.equal(fs.existsSync(state.f1.filePath), true);

    const replaced = await svc.setPurchaseRequisitionFileService(asUser(editorId), params(id), { file_id: f2.fileId });
    assert.equal(replaced.file.file_id, f2.fileId);
    assert.equal(await fileRowExists(state.f1.fileId), false, "la fila anterior se eliminó");
    assert.equal(fs.existsSync(state.f1.filePath), false, "los bytes anteriores se eliminaron");
    state.f2 = f2;
});

test("un reemplazo fallido no destruye el archivo actual (todo o nada)", async () => {
    const id = state.req.purchase_requisition_id;
    await assert.rejects(
        svc.setPurchaseRequisitionFileService(asUser(editorId), params(id), { file_id: state.metrados.fileId }),
        codeOf("DOCUMENT_FILE_NOT_FOUND")
    );
    assert.equal(await fileRowExists(state.f2.fileId), true);
    assert.equal(fs.existsSync(state.f2.filePath), true);
    assert.equal((await svc.getPurchaseRequisitionByIdService(asUser(plainId), params(id))).file.file_id, state.f2.fileId);
});

test("quitar el archivo (file_id null) lo elimina del sistema", async () => {
    const id = state.req.purchase_requisition_id;
    const detail = await svc.setPurchaseRequisitionFileService(asUser(editorId), params(id), { file_id: null });
    assert.equal(detail.file, null);
    assert.equal(await fileRowExists(state.f2.fileId), false);
    assert.equal(fs.existsSync(state.f2.filePath), false);
});

test("permisos: solo ver (miembro sin rol) lee pero no escribe; ajeno al proyecto no ve nada", async () => {
    const id = state.req.purchase_requisition_id;
    assert.equal((await svc.getPurchaseRequisitionByIdService(asUser(plainId), params(id))).number, "REQ-001");
    await assert.rejects(svc.createPurchaseRequisitionService(asUser(plainId), { projectId }, body({ number: "P-1" })), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(svc.updatePurchaseRequisitionService(asUser(plainId), params(id), { requester: "x" }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(svc.setPurchaseRequisitionFileService(asUser(plainId), params(id), { file_id: null }), codeOf("INSUFFICIENT_PERMISSIONS"));
    await assert.rejects(svc.listPurchaseRequisitionsService(asUser(outsiderId), { projectId }, {}), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    // aislamiento entre proyectos
    await assert.rejects(
        svc.getPurchaseRequisitionByIdService(asUser(OWNER_USER_ID), { projectId: otherProjectId, purchaseRequisitionId: id }),
        codeOf("PURCHASE_REQUISITION_NOT_FOUND")
    );
});

test("baja: la auditoría no la elimina un Editor (403); el dueño sí, y eso elimina su archivo y libera el número", async () => {
    const id = state.req.purchase_requisition_id;
    const f3 = await makeFile(projectId);
    await svc.setPurchaseRequisitionFileService(asUser(editorId), params(id), { file_id: f3.fileId });

    await assert.rejects(svc.deletePurchaseRequisitionService(asUser(editorId), params(id)), codeOf("INSUFFICIENT_PERMISSIONS"));
    assert.equal(await fileRowExists(f3.fileId), true, "el intento rechazado no borra nada");

    await svc.deletePurchaseRequisitionService(asUser(OWNER_USER_ID), params(id));
    assert.equal(await fileRowExists(f3.fileId), false, "la baja elimina el archivo físico");
    assert.equal(fs.existsSync(f3.filePath), false);
    await assert.rejects(svc.getPurchaseRequisitionByIdService(asUser(OWNER_USER_ID), params(id)), codeOf("PURCHASE_REQUISITION_NOT_FOUND"));
    await assert.rejects(svc.deletePurchaseRequisitionService(asUser(OWNER_USER_ID), params(id)), codeOf("PURCHASE_REQUISITION_NOT_FOUND"));
    await assert.rejects(svc.addPurchaseRequisitionItemService(asUser(editorId), params(id), { description: "x", quantity_requested: 1 }), codeOf("PURCHASE_REQUISITION_NOT_FOUND"));

    // La fila queda (auditoría) sin archivo, y el número se puede volver a usar.
    const [row] = await q(`SELECT deleted_at, file_id FROM purchase_requisitions WHERE purchase_requisition_id = $1`, [id]);
    assert.ok(row.deleted_at);
    assert.equal(row.file_id, null);
    const again = await svc.createPurchaseRequisitionService(asUser(OWNER_USER_ID), { projectId }, body());
    assert.equal(again.number, "REQ-001");
});

test("vaciar Almacén: cuenta y elimina requerimientos (incluidos los dados de baja) y sus archivos", async () => {
    const live = (await svc.listPurchaseRequisitionsService(asUser(OWNER_USER_ID), { projectId }, { search: "REQ-001" }))[0];
    const f4 = await makeFile(projectId);
    await svc.setPurchaseRequisitionFileService(asUser(editorId), params(live.purchase_requisition_id), { file_id: f4.fileId });

    const counts = await emptyAlmacenContentService(asUser(OWNER_USER_ID), { projectId });
    assert.equal(counts.purchase_requisitions, 3, "2 activos + 1 dado de baja");
    assert.equal(await fileRowExists(f4.fileId), false);
    assert.equal(fs.existsSync(f4.filePath), false);
    const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM purchase_requisition_items WHERE purchase_requisition_id IN
        (SELECT purchase_requisition_id FROM purchase_requisitions WHERE project_id = $1)`, [projectId]);
    assert.equal(n, 0);
    // El archivo de Metrados no se toca.
    assert.equal(await fileRowExists(state.metrados.fileId), true);
    await pool.query(`DELETE FROM files WHERE file_id = ANY($1::bigint[])`, [[state.metrados.fileId, state.foreign.fileId]]);
});
