// ifc-classification.service.test.js
//
// Test de integración (BD real) para resolveClassificationForProcessing
// — la función con más ramas del módulo de clasificación (ver
// docs/roadmap/consolidacion-y-hardening.md, punto 7). Corre contra
// dist/ ya compilado (node --test corre "npm run build" antes, ver
// package.json), así que importa directo desde ahí, igual que en
// producción — no hay mocks del driver de Postgres.
//
// Correr: npm test   (desde backend/)
// o suelto: node --test tests/ifc-classification.service.test.js
//   (requiere "npm run build" ya corrido antes, a mano)
import "dotenv/config";
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import pool from "../dist/db/database.js";
import { resolveClassificationForProcessing } from "../dist/services/ifc-classification.service.js";

// Usuario real ya existente en la BD de desarrollo (usado en el resto
// de la sesión como usuario de prueba conocido) — projects.owner_id y
// projects.created_by son NOT NULL FK a users(user_id), hace falta uno
// real para poder crear el proyecto descartable de este test.
const OWNER_USER_ID = 1;

let projectId;

before(async () => {
    const { rows } = await pool.query(
        `INSERT INTO projects (name, owner_id, created_by)
        VALUES ($1, $2, $2) RETURNING project_id`,
        ["[test] resolveClassificationForProcessing", OWNER_USER_ID]
    );
    projectId = Number(rows[0].project_id);
});

after(async () => {
    // ifc_classification_configs/_fields se van solas por ON DELETE
    // CASCADE (ver database/schema.sql) al borrar el proyecto.
    await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
    await pool.end();
});

// Deja la config del proyecto de prueba en un estado conocido antes de
// cada test — pasar null equivale a "sin fila de config todavía" (el
// caso DEFAULT_CONFIG / red de seguridad).
const setConfig = async (config) => {
    await pool.query(`DELETE FROM ifc_classification_config_fields WHERE project_id = $1`, [projectId]);
    await pool.query(`DELETE FROM ifc_classification_configs WHERE project_id = $1`, [projectId]);
    if (!config) return;

    await pool.query(
        `INSERT INTO ifc_classification_configs
            (project_id, mode, mode_locked, property_prefix, property_prefix_locked)
        VALUES ($1, $2, $3, $4, $5)`,
        [
            projectId,
            config.mode ?? "norma",
            config.mode_locked ?? false,
            config.property_prefix ?? null,
            config.property_prefix_locked ?? false,
        ]
    );

    if (config.fields) {
        await pool.query(
            `INSERT INTO ifc_classification_config_fields
                (project_id, slot, code_property_set, code_property_name,
                 description_property_set, description_property_name,
                 unit_property_set, unit_property_name)
            VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
            [
                projectId,
                config.fields.code_property_set ?? null,
                config.fields.code_property_name,
                config.fields.description_property_set ?? null,
                config.fields.description_property_name ?? null,
                config.fields.unit_property_set ?? null,
                config.fields.unit_property_name ?? null,
            ]
        );
    }
};

// --- mode ---

test("sin fila de config (red de seguridad) -> default norma, sin prefijo", async () => {
    await setConfig(null);
    const { snapshot } = await resolveClassificationForProcessing(projectId, undefined);
    assert.equal(snapshot.mode, "norma");
    assert.equal(snapshot.property_prefix, null);
});

test("mode='norma' guardado, sin override -> se mantiene norma", async () => {
    await setConfig({ mode: "norma" });
    const { snapshot } = await resolveClassificationForProcessing(projectId, undefined);
    assert.equal(snapshot.mode, "norma");
});

test("mode='norma' + override.mode='manual' (sin lock) -> el override gana", async () => {
    await setConfig({ mode: "norma", mode_locked: false });
    const { snapshot } = await resolveClassificationForProcessing(projectId, {
        mode: "manual",
        code_property_name: "CSRT-Partida1",
    });
    assert.equal(snapshot.mode, "manual");
    assert.equal(snapshot.code_property_name, "CSRT-Partida1");
});

test("mode_locked=true + override.mode='manual' -> tira MODE_LOCKED (409)", async () => {
    await setConfig({ mode: "norma", mode_locked: true });
    await assert.rejects(
        () => resolveClassificationForProcessing(projectId, { mode: "manual", code_property_name: "X" }),
        (err) => {
            assert.equal(err.statusCode, 409);
            assert.equal(err.response.code, "IFC_CLASSIFICATION_MODE_LOCKED");
            return true;
        }
    );
});

test("mode='manual' guardado con fields en BD, sin override -> usa los fields del slot 1", async () => {
    await setConfig({
        mode: "manual",
        fields: {
            code_property_set: "Otros",
            code_property_name: "CSRT-Partida1",
            unit_property_name: "CSRT-Unidad1",
        },
    });
    const { snapshot } = await resolveClassificationForProcessing(projectId, undefined);
    assert.equal(snapshot.mode, "manual");
    assert.equal(snapshot.code_property_set, "Otros");
    assert.equal(snapshot.code_property_name, "CSRT-Partida1");
    assert.equal(snapshot.unit_property_name, "CSRT-Unidad1");
});

test("mode='manual' guardado SIN fields en BD (caso raro/inconsistente) -> cae a norma en silencio", async () => {
    await setConfig({ mode: "manual" }); // sin fields
    const { snapshot } = await resolveClassificationForProcessing(projectId, undefined);
    assert.equal(snapshot.mode, "norma");
});

// --- property_prefix (independiente de mode) ---

test("sin fila de config -> property_prefix null", async () => {
    await setConfig(null);
    const { snapshot } = await resolveClassificationForProcessing(projectId, undefined);
    assert.equal(snapshot.property_prefix, null);
});

test("property_prefix guardado, sin override -> se mantiene", async () => {
    await setConfig({ property_prefix: "ABC-" });
    const { snapshot } = await resolveClassificationForProcessing(projectId, undefined);
    assert.equal(snapshot.property_prefix, "ABC-");
});

test("property_prefix guardado + override (sin lock) -> el override pisa", async () => {
    await setConfig({ property_prefix: "ABC-", property_prefix_locked: false });
    const { snapshot } = await resolveClassificationForProcessing(projectId, { property_prefix: "XYZ-" });
    assert.equal(snapshot.property_prefix, "XYZ-");
});

test("property_prefix_locked=true + override -> tira PREFIX_LOCKED (409)", async () => {
    await setConfig({ property_prefix: "ABC-", property_prefix_locked: true });
    await assert.rejects(
        () => resolveClassificationForProcessing(projectId, { property_prefix: "XYZ-" }),
        (err) => {
            assert.equal(err.statusCode, 409);
            assert.equal(err.response.code, "IFC_CLASSIFICATION_PREFIX_LOCKED");
            return true;
        }
    );
});

test("override.property_prefix = '' cuenta como 'sin prefijo' (null), no como string vacío", async () => {
    await setConfig({ property_prefix: "ABC-", property_prefix_locked: false });
    const { snapshot } = await resolveClassificationForProcessing(projectId, { property_prefix: "" });
    assert.equal(snapshot.property_prefix, null);
});

// --- mode y property_prefix se resuelven independientes (sin lock grupal) ---

test("pisar mode con el override no toca el property_prefix guardado", async () => {
    await setConfig({ mode: "norma", mode_locked: false, property_prefix: "ABC-", property_prefix_locked: false });
    const { snapshot } = await resolveClassificationForProcessing(projectId, {
        mode: "manual",
        code_property_name: "X",
    });
    assert.equal(snapshot.mode, "manual");
    assert.equal(snapshot.property_prefix, "ABC-");
});

test("pisar property_prefix con el override no toca el mode guardado", async () => {
    await setConfig({ mode: "norma", mode_locked: false, property_prefix: "ABC-", property_prefix_locked: false });
    const { snapshot } = await resolveClassificationForProcessing(projectId, { property_prefix: "XYZ-" });
    assert.equal(snapshot.mode, "norma");
    assert.equal(snapshot.property_prefix, "XYZ-");
});

test("mode_locked=true NO bloquea el override de property_prefix (candados independientes)", async () => {
    await setConfig({ mode: "norma", mode_locked: true, property_prefix: "ABC-", property_prefix_locked: false });
    const { snapshot } = await resolveClassificationForProcessing(projectId, { property_prefix: "XYZ-" });
    assert.equal(snapshot.property_prefix, "XYZ-");
});

test("property_prefix_locked=true NO bloquea el override de mode (candados independientes)", async () => {
    await setConfig({ mode: "norma", mode_locked: false, property_prefix: "ABC-", property_prefix_locked: true });
    const { snapshot } = await resolveClassificationForProcessing(projectId, {
        mode: "manual",
        code_property_name: "X",
    });
    assert.equal(snapshot.mode, "manual");
});
