// model-3d-content.test.js
//
// Regresión: con UPLOADS_DIR relativo (ej. "./uploads" en el .env), el path
// guardado en model_3d_assets es relativo y res.sendFile fallaba con
// "path must be absolute" (500). El service tiene que devolver una ruta absoluta.
import "dotenv/config";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import pool from "../dist/db/database.js";
import { getModel3DAssetContentService } from "../dist/services/almacen/model-3d-asset.service.js";

const OWNER_USER_ID = 1;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "model3d-content-"));
let projectId;
let assetId;

after(async () => {
    try {
        if (assetId) await pool.query(`DELETE FROM model_3d_assets WHERE model_3d_asset_id = $1`, [assetId]);
        if (projectId) await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
    } finally {
        await pool.end();
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
});

test("un path relativo guardado en la base se sirve como ruta absoluta", async () => {
    projectId = Number((await pool.query(
        `INSERT INTO projects (name, owner_id, created_by) VALUES ('[test] model3d content', $1, $1) RETURNING project_id`, [OWNER_USER_ID]
    )).rows[0].project_id);

    const absolute = path.join(tmpDir, "cubo.gltf");
    fs.writeFileSync(absolute, "{}");
    const relative = path.relative(process.cwd(), absolute); // como lo deja un UPLOADS_DIR relativo
    assert.equal(path.isAbsolute(relative), false);

    assetId = (await pool.query(
        `INSERT INTO model_3d_assets (name, format, file_path, owner_id) VALUES ('[test] cubo', 'gltf', $1, $2) RETURNING model_3d_asset_id`,
        [relative, OWNER_USER_ID]
    )).rows[0].model_3d_asset_id;

    const result = await getModel3DAssetContentService({ user_id: OWNER_USER_ID, role_id: 4, email: "t@example.test" }, projectId, assetId);
    assert.equal(path.isAbsolute(result.absolutePath), true, "sendFile exige ruta absoluta");
    assert.equal(fs.realpathSync(result.absolutePath), fs.realpathSync(absolute));
    assert.equal(result.format, "gltf");
});
