// files-module.service.test.js
//
// Test de integración (BD real) de la Fase 1 de
// docs/almacen-ingreso-productos/05-roadmap.md: cada archivo es de un
// proyecto Y de un módulo (files.module_id) y la portada del proyecto
// vive en columnas de `projects` (ya no en `files`). Corre contra dist/
// ya compilado, sin mocks del driver.
//
// Los tests son un FLUJO en orden (subir -> listar -> descargar -> borrar
// -> portada -> eliminar proyecto), no casos independientes: comparten el
// proyecto y los usuarios de prueba.
//
// Correr: npm test   (desde backend/)
import "dotenv/config";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Se apunta UPLOADS_DIR a una carpeta temporal ANTES de cargar dist/ (los
// imports son dinámicos: UPLOADS_DIR se lee al importar el módulo) para no
// tocar nunca backend/uploads/ — deleteProjectByIdService borra carpetas.
const TMP_UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "files-module-test-"));
process.env.UPLOADS_DIR = TMP_UPLOADS_DIR;

const { default: pool } = await import("../dist/db/database.js");
const { PUBLIC_UPLOADS_DIR } = await import("../dist/middlewares/upload.midleware.js");
const { createFixedCategoriesForProject } = await import("../dist/services/almacen/category.service.js");
const { emptyAlmacenContentService } = await import("../dist/services/almacen/almacen-content.service.js");
const {
    saveFileService, getProjectFilesService, deleteFileService, getFileForDownloadService,
} = await import("../dist/services/files.service.js");
const { setProjectCoverImageService, deleteProjectCoverImageService } = await import("../dist/services/project-images.service.js");
const { getProjectByIdService, deleteProjectByIdService } = await import("../dist/services/projects.service.js");

const OWNER_USER_ID = 1;
const asUser = (userId) => ({ user_id: userId, role_id: 4, email: "test@example.test" });
const codeOf = (expected) => (error) => error?.response?.code === expected;

let projectId;
let editorId;   // miembro con rol Editor de Almacén (view/upload/process/delete SOLO en Almacén)
let plainId;    // miembro sin ningún rol de módulo (mínimo: solo "ver" en todo)
let outsiderId; // no es miembro del proyecto
const state = {};

// Simula el objeto que deja multer: el archivo ya está en disco.
const fakeMulterFile = (dir, name, mimetype = "application/pdf") => {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`);
    fs.writeFileSync(filePath, "contenido de prueba");
    return { path: filePath, originalname: name, size: 19, mimetype };
};
const privateFile = (name) => fakeMulterFile(path.join(TMP_UPLOADS_DIR, String(projectId)), name);
const coverFile = (name) => fakeMulterFile(path.join(PUBLIC_UPLOADS_DIR, "covers", String(projectId)), name, "image/jpeg");

const createUser = async (label) => {
    const { rows } = await pool.query(
        `INSERT INTO users (name, email, password_hash, role_id) VALUES ($1, $2, 'x', 4) RETURNING user_id`,
        [`[test] ${label}`, `test-${label}-${randomUUID()}@example.test`]
    );
    return rows[0].user_id;
};
const addMember = async (userId) => (await pool.query(
    `INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) RETURNING project_member_id`,
    [projectId, userId]
)).rows[0].project_member_id;

before(async () => {
    const { rows } = await pool.query(
        `INSERT INTO projects (name, owner_id, created_by) VALUES ('[test] files-module', $1, $1) RETURNING project_id`,
        [OWNER_USER_ID]
    );
    projectId = Number(rows[0].project_id);

    const client = await pool.connect();
    try { await createFixedCategoriesForProject(client, projectId, OWNER_USER_ID); } finally { client.release(); }

    editorId = await createUser("editor");
    plainId = await createUser("plain");
    outsiderId = await createUser("outsider");

    const editorMemberId = await addMember(editorId);
    await addMember(plainId);
    await pool.query(
        `INSERT INTO project_member_module_roles (project_member_id, module_id, module_role_id)
        SELECT $1, m.module_id, mr.module_role_id
        FROM modules m INNER JOIN module_roles mr ON mr.module_id = m.module_id
        WHERE m.code = 'almacen' AND mr.name = 'Editor'`,
        [editorMemberId]
    );
});

after(async () => {
    try {
        try { await emptyAlmacenContentService(asUser(OWNER_USER_ID), { projectId }); } catch { /* ya vacío o ya no existe */ }
        await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
        await pool.query(`DELETE FROM users WHERE user_id = ANY($1::int[])`, [[editorId, plainId, outsiderId]]);
    } finally {
        await pool.end();
        fs.rmSync(TMP_UPLOADS_DIR, { recursive: true, force: true });
    }
});

test("el dueño sube a Almacén y a Metrados: queda guardado el módulo y el archivo existe", async () => {
    const almacen = await saveFileService(asUser(OWNER_USER_ID), { projectId }, "almacen", undefined, privateFile("factura.pdf"));
    const metrados = await saveFileService(asUser(OWNER_USER_ID), { projectId }, "metrados", undefined, privateFile("planilla.pdf"));
    state.ownerAlmacenFile = almacen;
    state.ownerMetradosFile = metrados;

    assert.equal(almacen.module_code, "almacen");
    assert.equal(metrados.module_code, "metrados");

    const { rows } = await pool.query(
        `SELECT m.code FROM files f INNER JOIN modules m ON m.module_id = f.module_id WHERE f.file_id = $1`, [almacen.file_id]
    );
    assert.equal(rows[0].code, "almacen", "files.module_id apunta al módulo correcto");
});

test("un Editor de Almacén sube a Almacén pero NO a Metrados (403); el archivo temporal se limpia", async () => {
    state.editorFile = await saveFileService(asUser(editorId), { projectId }, "almacen", undefined, privateFile("guia.pdf"));
    assert.equal(state.editorFile.module_code, "almacen");

    const rejected = privateFile("no-debe-quedar.pdf");
    await assert.rejects(
        saveFileService(asUser(editorId), { projectId }, "metrados", undefined, rejected),
        codeOf("INSUFFICIENT_PERMISSIONS")
    );
    assert.equal(fs.existsSync(rejected.path), false, "el archivo rechazado no queda huérfano en disco");
});

test("un miembro sin rol (solo 'ver') no puede subir a ningún módulo", async () => {
    for (const moduleCode of ["almacen", "metrados"]) {
        const rejected = privateFile(`${moduleCode}.pdf`);
        await assert.rejects(
            saveFileService(asUser(plainId), { projectId }, moduleCode, undefined, rejected),
            codeOf("INSUFFICIENT_PERMISSIONS")
        );
        assert.equal(fs.existsSync(rejected.path), false);
    }
});

test("un ajeno al proyecto recibe 404; un módulo inexistente o inactivo se rechaza", async () => {
    await assert.rejects(
        saveFileService(asUser(outsiderId), { projectId }, "almacen", undefined, privateFile("x.pdf")),
        codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED")
    );
    await assert.rejects(
        saveFileService(asUser(OWNER_USER_ID), { projectId }, "no-existe", undefined, privateFile("x.pdf")),
        codeOf("MODULE_NOT_FOUND")
    );
    await assert.rejects(
        saveFileService(asUser(OWNER_USER_ID), { projectId }, "logistica", undefined, privateFile("x.pdf")),
        codeOf("MODULE_NOT_ACTIVE")
    );
});

test("listado: sin filtro trae todos los módulos, con module_code filtra, y valida el módulo", async () => {
    const all = await getProjectFilesService(asUser(OWNER_USER_ID), { projectId }, {});
    assert.deepEqual(all.map((f) => f.module_code).sort(), ["almacen", "almacen", "metrados"]);

    const onlyAlmacen = await getProjectFilesService(asUser(OWNER_USER_ID), { projectId }, { module_code: "almacen" });
    assert.equal(onlyAlmacen.length, 2);
    assert.ok(onlyAlmacen.every((f) => f.module_code === "almacen"));

    const onlyMetrados = await getProjectFilesService(asUser(OWNER_USER_ID), { projectId }, { module_code: "metrados" });
    assert.deepEqual(onlyMetrados.map((f) => f.file_id), [state.ownerMetradosFile.file_id]);

    await assert.rejects(
        getProjectFilesService(asUser(OWNER_USER_ID), { projectId }, { module_code: "no-existe" }),
        codeOf("MODULE_NOT_FOUND")
    );

    // Todo miembro tiene "ver" por defecto en todos los módulos (decisión con
    // el cliente): un miembro sin rol lista sin problema. Un ajeno, no.
    assert.equal((await getProjectFilesService(asUser(plainId), { projectId }, {})).length, 3);
    await assert.rejects(getProjectFilesService(asUser(outsiderId), { projectId }, {}), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
});

test("descarga: un miembro (con 'ver') puede, un ajeno no, y la vía de token firmado (usuario null) no consulta permisos", async () => {
    const id = state.ownerAlmacenFile.file_id;
    assert.equal((await getFileForDownloadService({ fileId: id }, asUser(plainId))).file_id, id);
    await assert.rejects(getFileForDownloadService({ fileId: id }, asUser(outsiderId)), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    assert.equal((await getFileForDownloadService({ fileId: id }, null)).file_id, id);
});

test("borrar: exige el permiso 'delete' del módulo del archivo y ser quien lo subió o el dueño del proyecto", async () => {
    // Un miembro sin rol tiene solo "ver": 403 y el archivo sigue existiendo.
    await assert.rejects(
        deleteFileService(asUser(plainId), { projectId, fileId: state.editorFile.file_id }),
        codeOf("INSUFFICIENT_PERMISSIONS")
    );
    assert.equal((await pool.query(`SELECT 1 FROM files WHERE file_id = $1`, [state.editorFile.file_id])).rowCount, 1);

    // El Editor tiene "delete" en Almacén pero no subió el archivo del dueño: no lo puede borrar.
    await assert.rejects(
        deleteFileService(asUser(editorId), { projectId, fileId: state.ownerAlmacenFile.file_id }),
        codeOf("FILE_NOT_FOUND")
    );

    // El Editor sí borra el suyo (fila y bytes), y el dueño del proyecto borra cualquiera.
    const { rows: [{ file_path: editorPath }] } = await pool.query(`SELECT file_path FROM files WHERE file_id = $1`, [state.editorFile.file_id]);
    await deleteFileService(asUser(editorId), { projectId, fileId: state.editorFile.file_id });
    assert.equal(fs.existsSync(editorPath), false, "los bytes del archivo se borran");

    await deleteFileService(asUser(OWNER_USER_ID), { projectId, fileId: state.ownerMetradosFile.file_id });
    assert.equal((await pool.query(`SELECT 1 FROM files WHERE project_id = $1 AND file_id = $2`, [projectId, state.ownerMetradosFile.file_id])).rowCount, 0);
});

test("portada: se guarda en columnas de projects (NO en files), cover_image sin file_id, y reemplazar limpia los bytes viejos", async () => {
    const filesBefore = (await pool.query(`SELECT COUNT(*)::int AS n FROM files WHERE project_id = $1`, [projectId])).rows[0].n;

    const first = coverFile("portada1.jpg");
    const set1 = await setProjectCoverImageService(asUser(OWNER_USER_ID), { projectId }, first);
    assert.deepEqual(Object.keys(set1).sort(), ["file_size", "mime_type", "name", "url"],
        "la respuesta no trae file_id: la portada ya no es un archivo");
    assert.equal(set1.url, `/uploads/covers/${projectId}/${path.basename(first.path)}`);
    assert.equal(set1.file_size, 19);

    assert.equal((await pool.query(`SELECT COUNT(*)::int AS n FROM files WHERE project_id = $1`, [projectId])).rows[0].n, filesBefore,
        "subir una portada no crea ninguna fila en files");

    const detail = await getProjectByIdService(asUser(OWNER_USER_ID), { projectId });
    assert.deepEqual(detail.cover_image, { name: "portada1.jpg", mime_type: "image/jpeg", url: set1.url });

    const second = coverFile("portada2.jpg");
    await setProjectCoverImageService(asUser(OWNER_USER_ID), { projectId }, second);
    assert.equal(fs.existsSync(first.path), false, "los bytes de la portada anterior se borran");
    assert.equal(fs.existsSync(second.path), true);
    state.currentCover = second;
});

test("portada: solo el dueño puede fijarla (404 y sin archivo huérfano); borrarla vuelve a la portada por defecto", async () => {
    const rejected = coverFile("ajena.jpg");
    await assert.rejects(setProjectCoverImageService(asUser(plainId), { projectId }, rejected), codeOf("PROJECT_NOT_FOUND_OR_UNAUTHORIZED"));
    assert.equal(fs.existsSync(rejected.path), false);

    const deleted = await deleteProjectCoverImageService(asUser(OWNER_USER_ID), { projectId });
    assert.deepEqual(Object.keys(deleted).sort(), ["mime_type", "name", "url"]);
    assert.equal(deleted.name, "project-deafault.jpg", "vuelve a la imagen por defecto");
    assert.equal(fs.existsSync(state.currentCover.path), false, "los bytes de la portada se borran");

    const { rows } = await pool.query(
        `SELECT cover_image_path, cover_image_name, cover_image_mime_type FROM projects WHERE project_id = $1`, [projectId]
    );
    assert.deepEqual(rows[0], { cover_image_path: null, cover_image_name: null, cover_image_mime_type: null });

    await assert.rejects(deleteProjectCoverImageService(asUser(OWNER_USER_ID), { projectId }), codeOf("PROJECT_NO_COVER_IMAGE"));
});

test("eliminar el proyecto: exige Almacén vacío (sus archivos cuentan), y borra los bytes de la portada", async () => {
    // Queda el archivo de Almacén del dueño (state.ownerAlmacenFile): cuenta como contenido.
    await assert.rejects(deleteProjectByIdService(asUser(OWNER_USER_ID), { projectId }), codeOf("ALMACEN_CONTENT_NOT_EMPTY"));

    const cover = coverFile("portada-final.jpg");
    await setProjectCoverImageService(asUser(OWNER_USER_ID), { projectId }, cover);

    const emptied = await emptyAlmacenContentService(asUser(OWNER_USER_ID), { projectId });
    assert.equal(emptied.files, 1, "vaciar Almacén borra sus archivos");

    await deleteProjectByIdService(asUser(OWNER_USER_ID), { projectId });
    assert.equal(fs.existsSync(cover.path), false, "los bytes de la portada no quedan huérfanos");
    assert.equal(fs.existsSync(path.join(PUBLIC_UPLOADS_DIR, "covers", String(projectId))), false);
    assert.equal((await pool.query(`SELECT 1 FROM projects WHERE project_id = $1`, [projectId])).rowCount, 0);
});
