// almacen-content.service.test.js
//
// Test de integración (BD real) de la Fase 0 de
// docs/almacen-ingreso-productos/05-roadmap.md: vaciar Almacén y el
// candado de eliminar un proyecto. Corre contra dist/ ya compilado (igual
// que ifc-classification.service.test.js), sin mocks del driver.
//
// Los tests de este archivo son un FLUJO en orden (summary vacío ->
// sembrar -> eliminar bloqueado -> Editor rechazado -> vaciar ->
// eliminar), no casos independientes: comparten el proyecto de prueba.
//
// Cada tabla nueva que Almacén guarde por proyecto tiene que sumarse a
// seedAlmacenData() y a los chequeos de huérfanos de este archivo (y a
// emptyAlmacenContentService).
//
// Correr: npm test   (desde backend/)
import "dotenv/config";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// deleteProjectByIdService borra la carpeta uploads/<projectId> del
// disco: el ID de un proyecto de prueba podría coincidir con una carpeta
// vieja de desarrollo (los IDs se reinician con reset.sql). Se apunta
// UPLOADS_DIR a una carpeta temporal ANTES de cargar dist/ (por eso los
// imports son dinámicos: UPLOADS_DIR se lee al importar el módulo).
const TMP_UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "almacen-content-test-"));
process.env.UPLOADS_DIR = TMP_UPLOADS_DIR;

const { default: pool } = await import("../dist/db/database.js");
const { createFixedCategoriesForProject } = await import("../dist/services/almacen/category.service.js");
const { emptyAlmacenContentService, getAlmacenSummaryService } = await import("../dist/services/almacen/almacen-content.service.js");
const { deleteProjectByIdService } = await import("../dist/services/projects.service.js");

// Usuario ya existente en la BD (dueño del proyecto de prueba) — mismo
// criterio que ifc-classification.service.test.js.
const OWNER_USER_ID = 1;
const asUser = (userId) => ({ user_id: userId, role_id: 1, email: "test@example.test" });
const codeOf = (expected) => (error) => error?.response?.code === expected;

let projectId;
let editorId;
let seeded; // ids sembrados, para comprobar que no queda ningún huérfano

const seedAlmacenData = async () => {
    const q = async (sql, params) => (await pool.query(sql, params)).rows;
    const [{ warehouse_style_id: styleId }] = await q(`SELECT warehouse_style_id FROM warehouse_styles LIMIT 1`);
    const [{ category_id: categoryId }] = await q(
        `SELECT category_id FROM categories WHERE project_id = $1 AND name = 'Partida'`, [projectId]
    );

    const [{ warehouse_id: warehouseId }] = await q(
        `INSERT INTO warehouses (project_id, warehouse_style_id, name, corner1_x, corner1_z, corner2_x, corner2_z,
            direction, area_m2, grid_width, grid_depth, created_by)
        VALUES ($1, $2, '[test] almacén', 0, 0, 10, 10, 'norte', 100, 5, 5, $3) RETURNING warehouse_id`,
        [projectId, styleId, OWNER_USER_ID]
    );
    const [{ rack_id: rackId }] = await q(
        `INSERT INTO racks (warehouse_id, name, corner1_x, corner1_z, corner2_x, corner2_z, levels, direction, created_by)
        VALUES ($1, '[test] estante', 0, 0, 1.3, 1.3, 1, 0, $2) RETURNING rack_id`,
        [warehouseId, OWNER_USER_ID]
    );
    const bins = await q(
        `INSERT INTO bins (rack_id, bay, level, face, location_label, name)
        VALUES ($1, 0, 0, 0, 'A1', 'A1'), ($1, 1, 0, 0, 'A2', 'A2') RETURNING bin_id`,
        [rackId]
    );
    const [{ product_id: productId }] = await q(
        `INSERT INTO products (project_id, category_id, code, is_fixed, display_id, name, unit, created_by)
        VALUES ($1, $2, 'T-1', true, 1, '[test] producto', 'und', $3) RETURNING product_id`,
        [projectId, categoryId, OWNER_USER_ID]
    );
    await q(`UPDATE categories SET next_display_id = 2 WHERE category_id = $1`, [categoryId]);
    const [{ bin_content_id: binContentId }] = await q(
        `INSERT INTO bin_contents (bin_id, product_id, quantity, created_by) VALUES ($1, $2, 7, $3) RETURNING bin_content_id`,
        [bins[0].bin_id, productId, OWNER_USER_ID]
    );

    const [{ supplier_id: supplierId }] = await q(
        `INSERT INTO suppliers (project_id, ruc, name, created_by)
        VALUES ($1, '20123456789', '[test] proveedor', $2) RETURNING supplier_id`,
        [projectId, OWNER_USER_ID]
    );
    const [{ goods_receipt_id: receiptId }] = await q(
        `INSERT INTO goods_receipts (project_id, supplier_id, delivery_note_series, delivery_note_number, delivery_note_date, created_by)
        VALUES ($1, $2, 'T001', '1', CURRENT_DATE, $3) RETURNING goods_receipt_id`,
        [projectId, supplierId, OWNER_USER_ID]
    );
    const [{ goods_receipt_item_id: receiptItemId }] = await q(
        `INSERT INTO goods_receipt_items (goods_receipt_id, product_id, total_quantity) VALUES ($1, $2, 10) RETURNING goods_receipt_item_id`,
        [receiptId, productId]
    );
    await q(
        `INSERT INTO goods_receipt_item_locations (goods_receipt_item_id, bin_id, quantity) VALUES ($1, $2, 10)`,
        [receiptItemId, bins[0].bin_id]
    );

    const [{ goods_issue_id: issueId }] = await q(
        `INSERT INTO goods_issues (project_id, destination_sector, destination_level, destination_block,
            recipient_name, recipient_dni, issue_date, created_by)
        VALUES ($1, 's', 'n', 'b', '[test] recibe', '12345678', CURRENT_DATE, $2) RETURNING goods_issue_id`,
        [projectId, OWNER_USER_ID]
    );
    const [{ goods_issue_item_id: issueItemId }] = await q(
        `INSERT INTO goods_issue_items (goods_issue_id, product_id, total_quantity) VALUES ($1, $2, 3) RETURNING goods_issue_item_id`,
        [issueId, productId]
    );
    await q(
        `INSERT INTO goods_issue_item_locations (goods_issue_item_id, bin_id, quantity) VALUES ($1, $2, 3)`,
        [issueItemId, bins[0].bin_id]
    );

    const movements = await q(
        `INSERT INTO inventory_movements (product_id, type, quantity, bin_id, resulting_balance,
            reference_document_type, reference_document_id, movement_date, created_by)
        VALUES ($1, 'entrada', 10, $2, 10, 'goods_receipt', $3, CURRENT_DATE, $5), ($1, 'salida', 3, $2, 7, 'goods_issue', $4, CURRENT_DATE, $5)
        RETURNING inventory_movement_id`,
        [productId, bins[0].bin_id, receiptId, issueId, OWNER_USER_ID]
    );

    // Grupo fusionado de casillas: sin endpoints todavía, pero la tabla existe.
    const [{ bin_merge_group_id: groupId }] = await q(`INSERT INTO bin_merge_groups DEFAULT VALUES RETURNING bin_merge_group_id`);
    await q(`INSERT INTO bin_merge_members (bin_merge_group_id, bin_id) VALUES ($1, $2)`, [groupId, bins[1].bin_id]);

    // Un archivo de Almacén y uno de Metrados en el MISMO proyecto, con
    // bytes reales en la carpeta temporal: vaciar Almacén borra el primero
    // (fila y bytes) y NO toca el segundo.
    const projectDir = path.join(TMP_UPLOADS_DIR, String(projectId));
    fs.mkdirSync(projectDir, { recursive: true });
    const fileIds = {};
    const filePaths = {};
    for (const moduleCode of ["almacen", "metrados"]) {
        const filePath = path.join(projectDir, `${moduleCode}.pdf`);
        fs.writeFileSync(filePath, "%PDF-1.4 prueba");
        const [{ file_id: fileId }] = await q(
            `INSERT INTO files (project_id, module_id, file_type, name, file_path, uploaded_by)
            SELECT $1, module_id, 'pdf', $3, $2, $4 FROM modules WHERE code = $5 RETURNING file_id`,
            [projectId, filePath, `${moduleCode}.pdf`, OWNER_USER_ID, moduleCode]
        );
        fileIds[moduleCode] = fileId;
        filePaths[moduleCode] = filePath;
    }

    // Un requerimiento con una línea (con producto) y el archivo de Almacén
    // adjunto: vaciar debe eliminarlo ANTES de products (RESTRICT) y de files.
    const [{ purchase_requisition_id: requisitionId }] = await q(
        `INSERT INTO purchase_requisitions (project_id, number, requisition_date, requester, file_id, created_by)
        VALUES ($1, 'REQ-1', CURRENT_DATE, '[test] solicitante', $2, $3) RETURNING purchase_requisition_id`,
        [projectId, fileIds.almacen, OWNER_USER_ID]
    );
    const [{ purchase_requisition_item_id: requisitionItemId }] = await q(
        `INSERT INTO purchase_requisition_items (purchase_requisition_id, product_id, description, quantity_requested)
        VALUES ($1, $2, '[test] línea', 5) RETURNING purchase_requisition_item_id`,
        [requisitionId, productId]
    );

    // Una cotización de ese proveedor a ese requerimiento, con una línea.
    const [{ quotation_id: quotationId }] = await q(
        `INSERT INTO quotations (project_id, supplier_id, purchase_requisition_id, number, quotation_date, currency, created_by)
        VALUES ($1, $2, $3, 'COT-1', CURRENT_DATE, 'PEN', $4) RETURNING quotation_id`,
        [projectId, supplierId, requisitionId, OWNER_USER_ID]
    );
    const [{ quotation_item_id: quotationItemId }] = await q(
        `INSERT INTO quotation_items (quotation_id, purchase_requisition_item_id, product_id, description, quantity_quoted, line_total)
        VALUES ($1, $2, $3, '[test] línea cotizada', 5, 100) RETURNING quotation_item_id`,
        [quotationId, requisitionItemId, productId]
    );

    return {
        quotationId, quotationItemId,
        requisitionId, requisitionItemId,
        almacenFileId: fileIds.almacen, metradosFileId: fileIds.metrados, filePaths,
        supplierId, warehouseId, rackId, productId, binContentId, receiptId, receiptItemId, issueId, issueItemId, groupId,
        binIds: bins.map((b) => b.bin_id),
        movementIds: movements.map((m) => m.inventory_movement_id),
    };
};

// Cuántas de las filas sembradas siguen existiendo (debe ser 0 tras vaciar).
const remainingSeededRows = async () => {
    const s = seeded;
    const checks = [
        ["suppliers", "supplier_id", [s.supplierId]],
        ["quotations", "quotation_id", [s.quotationId]],
        ["quotation_items", "quotation_item_id", [s.quotationItemId]],
        ["purchase_requisitions", "purchase_requisition_id", [s.requisitionId]],
        ["purchase_requisition_items", "purchase_requisition_item_id", [s.requisitionItemId]],
        ["warehouses", "warehouse_id", [s.warehouseId]],
        ["racks", "rack_id", [s.rackId]],
        ["bins", "bin_id", s.binIds],
        ["products", "product_id", [s.productId]],
        ["bin_contents", "bin_content_id", [s.binContentId]],
        ["goods_receipts", "goods_receipt_id", [s.receiptId]],
        ["goods_receipt_items", "goods_receipt_item_id", [s.receiptItemId]],
        ["goods_receipt_item_locations", "goods_receipt_item_id", [s.receiptItemId]],
        ["goods_issues", "goods_issue_id", [s.issueId]],
        ["goods_issue_items", "goods_issue_item_id", [s.issueItemId]],
        ["goods_issue_item_locations", "goods_issue_item_id", [s.issueItemId]],
        ["inventory_movements", "inventory_movement_id", s.movementIds],
        ["files", "file_id", [s.almacenFileId]],
        ["bin_merge_groups", "bin_merge_group_id", [s.groupId]],
        ["bin_merge_members", "bin_merge_group_id", [s.groupId]],
    ];
    const left = {};
    for (const [table, column, ids] of checks) {
        const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE ${column} = ANY($1::bigint[])`, [ids]);
        if (rows[0].n > 0) left[table] = rows[0].n;
    }
    return left;
};

before(async () => {
    const { rows } = await pool.query(
        `INSERT INTO projects (name, owner_id, created_by) VALUES ('[test] almacen-content', $1, $1) RETURNING project_id`,
        [OWNER_USER_ID]
    );
    projectId = Number(rows[0].project_id);

    const client = await pool.connect();
    try {
        await createFixedCategoriesForProject(client, projectId, OWNER_USER_ID);
    } finally {
        client.release();
    }

    // Miembro con rol Editor de Almacén: tiene view/upload/process/delete
    // pero NO es dueño ni administrador del proyecto.
    const user = await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id)
        VALUES ('[test] editor', $1, 'x', 4) RETURNING user_id`,
        [`test-editor-${randomUUID()}@example.test`]
    );
    editorId = user.rows[0].user_id;
    const member = await pool.query(
        `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) RETURNING project_member_id`,
        [projectId, editorId]
    );
    await pool.query(
        `INSERT INTO project_member_module_roles (project_member_id, module_id, module_role_id)
        SELECT $1, m.module_id, mr.module_role_id
        FROM modules m INNER JOIN module_roles mr ON mr.module_id = m.module_id
        WHERE m.code = 'almacen' AND mr.name = 'Editor'`,
        [member.rows[0].project_member_id]
    );
});

after(async () => {
    try {
        // Si algún test falló a medias puede quedar contenido de Almacén: hay
        // que vaciarlo antes, igual que en la app (si no, RESTRICT traba el DELETE).
        try { await emptyAlmacenContentService(asUser(OWNER_USER_ID), { projectId }); } catch { /* ya vacío o ya no existe */ }
        await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
        await pool.query(`DELETE FROM users WHERE user_id = $1`, [editorId]);
    } finally {
        await pool.end();
        fs.rmSync(TMP_UPLOADS_DIR, { recursive: true, force: true });
    }
});

test("summary de un proyecto sin datos de Almacén: vacío, con todo en 0", async () => {
    const summary = await getAlmacenSummaryService(asUser(OWNER_USER_ID), { projectId });
    assert.deepEqual(summary, {
        suppliers: 0, purchase_requisitions: 0, quotations: 0, warehouses: 0, racks: 0, bins: 0, products: 0,
        goods_receipts: 0, goods_issues: 0, inventory_movements: 0, files: 0, is_empty: true,
    });
});

test("summary con datos: cuenta todo (incluye grupos y movimientos) y is_empty=false", async () => {
    seeded = await seedAlmacenData();
    const summary = await getAlmacenSummaryService(asUser(OWNER_USER_ID), { projectId });
    assert.deepEqual(summary, {
        suppliers: 1, purchase_requisitions: 1, quotations: 1, warehouses: 1, racks: 1, bins: 2, products: 1,
        goods_receipts: 1, goods_issues: 1, inventory_movements: 2, files: 1, is_empty: false,
    });
});

test("eliminar el proyecto con datos de Almacén se rechaza con 409 y el proyecto sigue existiendo", async () => {
    await assert.rejects(
        deleteProjectByIdService(asUser(OWNER_USER_ID), { projectId }),
        codeOf("ALMACEN_CONTENT_NOT_EMPTY")
    );
    const { rowCount } = await pool.query(`SELECT 1 FROM projects WHERE project_id = $1`, [projectId]);
    assert.equal(rowCount, 1);
});

test("un no-dueño no puede eliminar el proyecto (mismo 404 de siempre)", async () => {
    await assert.rejects(
        deleteProjectByIdService(asUser(editorId), { projectId }),
        codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED")
    );
});

test("un Editor puede ver el summary pero NO vaciar Almacén (403), y no se borró nada", async () => {
    const summary = await getAlmacenSummaryService(asUser(editorId), { projectId });
    assert.equal(summary.is_empty, false);

    await assert.rejects(
        emptyAlmacenContentService(asUser(editorId), { projectId }),
        codeOf("ADMIN_PERMISSION_REQUIRED")
    );
    assert.equal((await getAlmacenSummaryService(asUser(OWNER_USER_ID), { projectId })).is_empty, false);
});

test("el dueño vacía Almacén: devuelve lo eliminado, no deja huérfanos y conserva las 3 categorías", async () => {
    const deleted = await emptyAlmacenContentService(asUser(OWNER_USER_ID), { projectId });
    assert.deepEqual(deleted, {
        suppliers: 1, purchase_requisitions: 1, quotations: 1, warehouses: 1, racks: 1, bins: 2, products: 1,
        goods_receipts: 1, goods_issues: 1, inventory_movements: 2, files: 1,
    });

    assert.deepEqual(await remainingSeededRows(), {}, "no debe quedar ninguna fila sembrada");

    // Los bytes del archivo de Almacén se borraron; el archivo de Metrados
    // del mismo proyecto sigue intacto (fila y bytes).
    assert.equal(fs.existsSync(seeded.filePaths.almacen), false, "los bytes del archivo de Almacén se borran");
    assert.equal(fs.existsSync(seeded.filePaths.metrados), true, "el archivo de Metrados NO se toca");
    assert.equal(
        (await pool.query(`SELECT 1 FROM files WHERE file_id = $1`, [seeded.metradosFileId])).rowCount, 1,
        "la fila del archivo de Metrados sigue existiendo"
    );
    assert.equal((await getAlmacenSummaryService(asUser(OWNER_USER_ID), { projectId })).is_empty, true);

    const { rows } = await pool.query(
        `SELECT name, next_display_id FROM categories WHERE project_id = $1 ORDER BY category_id`, [projectId]
    );
    assert.deepEqual(rows.map((r) => r.name), ["Partida", "Materiales", "Equipo"]);
    assert.ok(rows.every((r) => r.next_display_id === 1), "los contadores de ID vuelven a 1");
});

test("vaciar un Almacén ya vacío es válido (devuelve todo en 0)", async () => {
    const deleted = await emptyAlmacenContentService(asUser(OWNER_USER_ID), { projectId });
    assert.ok(Object.values(deleted).every((n) => n === 0));
});

test("con Almacén vacío el dueño sí puede eliminar el proyecto (arrastra las categorías)", async () => {
    await deleteProjectByIdService(asUser(OWNER_USER_ID), { projectId });

    assert.equal((await pool.query(`SELECT 1 FROM projects WHERE project_id = $1`, [projectId])).rowCount, 0);
    assert.equal((await pool.query(`SELECT 1 FROM categories WHERE project_id = $1`, [projectId])).rowCount, 0);
});
