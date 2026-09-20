// dates-timezone.test.js
//
// Regresión (hallada el 2026-09-19): en un servidor al oeste de UTC (Lima,
// UTC-5) una fecha "solo día" que llega como "2026-09-10" y pasa por
// z.coerce.date() se guardaba un día ANTES (2026-09-09), porque pg
// serializaba el Date en la zona horaria local. Se corrigió con
// pg.defaults.parseInputDatesAsUTC en db/database.ts.
//
// Se FUERZA la zona horaria de Lima antes de cargar nada, así el test
// falla si se quita la corrección aunque el servidor de CI esté en UTC
// (node --test corre cada archivo en su propio proceso: no afecta a los
// demás tests).
//
// Correr: npm test   (desde backend/)
process.env.TZ = "America/Lima";

import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

const { default: pool } = await import("../dist/db/database.js");
const { createProjectService, updateProjectService } = await import("../dist/services/projects.service.js");
const { ProjectCreateSchema } = await import("../dist/schemas/projects.schema.js");

const OWNER_USER_ID = 1;
const asUser = (userId) => ({ user_id: userId, role_id: 1, email: "test@example.test" });
let projectId;

after(async () => {
    if (projectId) await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
    await pool.end();
});

const storedDates = async () => (await pool.query(
    `SELECT start_date::text AS start_date, end_date::text AS end_date FROM projects WHERE project_id = $1`, [projectId]
)).rows[0];

test("la zona horaria del proceso es realmente la de Lima (si no, este test no prueba nada)", () => {
    assert.equal(new Date("2026-09-10T12:00:00Z").getTimezoneOffset(), 300);
});

test("una fecha 'solo día' se guarda tal cual llega (antes se guardaba el día anterior)", async () => {
    const body = ProjectCreateSchema.parse({
        name: "[test] fechas", description: null, location: null, client: null, contractor: null,
        start_date: "2026-09-10", end_date: "2026-12-31",
    });
    const created = await createProjectService(asUser(OWNER_USER_ID), body);
    projectId = Number(created.project_id);
    assert.deepEqual(await storedDates(), { start_date: "2026-09-10", end_date: "2026-12-31" });

    await updateProjectService(asUser(OWNER_USER_ID), { projectId }, { start_date: new Date("2027-01-01") });
    assert.equal((await storedDates()).start_date, "2027-01-01");
});
