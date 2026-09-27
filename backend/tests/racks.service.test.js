// racks.service.test.js
//
// Test de integración (BD real) del cambio posterior a la v1 (2026-09-26): un estante
// ya NO guarda sus esquinas en metros ni deriva bays/depth dividiendo por un tamaño de
// cubo fijo del sistema (CUBE_SIZE). Ahora bays/depth son datos directos, y corner1/
// corner2 son índices ENTEROS de la grilla del almacén, validados contra bays/depth
// (no derivados). Cubre lo que antes no tenía ningún test: la validación de esquinas,
// el choque entre estantes, el límite del almacén y la generación de casillas.
//
// Cada caso usa su propia franja de Z bien separada de las demás (o un almacén aparte
// para lo de "fuera de la grilla"), para no tener que pensar en colisiones cruzadas
// entre casos que comparten el mismo almacén.
//
// Correr: npm test   (desde backend/)
import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";

import pool from "../dist/db/database.js";
import { createFixedCategoriesForProject } from "../dist/services/almacen/category.service.js";
import { emptyAlmacenContentService } from "../dist/services/almacen/almacen-content.service.js";
import {
    createRackService, deleteRackService, getRackByIdService, listRacksService, updateRackService,
} from "../dist/services/almacen/rack.service.js";
import { CreateRackBodySchema } from "../dist/schemas/almacen/rack.schema.js";

const OWNER_USER_ID = 1;
const asOwner = { user_id: OWNER_USER_ID, role_id: 4, email: "test@example.test" };
const codeOf = (expected) => (error) => error?.response?.code === expected;

let projectId;
let warehouseId;     // grid 6 x 25 — ancho justo, profundidad amplia para separar cada caso en su propia franja de Z
let tinyWarehouseId; // grid 3 x 3 — solo para el caso "fuera de la grilla"

before(async () => {
    projectId = Number((await pool.query(
        `INSERT INTO projects (name, owner_id, created_by) VALUES ('[test] racks', $1, $1) RETURNING project_id`, [OWNER_USER_ID]
    )).rows[0].project_id);

    const client = await pool.connect();
    try { await createFixedCategoriesForProject(client, projectId, OWNER_USER_ID); } finally { client.release(); }

    const q = async (sql, params) => (await pool.query(sql, params)).rows;
    const [{ warehouse_style_id: styleId3 }] = await q(`SELECT warehouse_style_id FROM warehouse_styles WHERE max_level = 3 LIMIT 1`);
    [{ warehouse_id: warehouseId }] = await q(
        `INSERT INTO warehouses (project_id, warehouse_style_id, name, corner1_x, corner1_z, corner2_x, corner2_z, direction, area_m2, grid_width, grid_depth, created_by)
        VALUES ($1, $2, '[test] almacén', 0, 0, 10, 10, 'norte', 100, 6, 25, $3) RETURNING warehouse_id`,
        [projectId, styleId3, OWNER_USER_ID]
    );
    [{ warehouse_id: tinyWarehouseId }] = await q(
        `INSERT INTO warehouses (project_id, warehouse_style_id, name, corner1_x, corner1_z, corner2_x, corner2_z, direction, area_m2, grid_width, grid_depth, created_by)
        VALUES ($1, $2, '[test] almacén chico', 0, 0, 4, 4, 'norte', 16, 3, 3, $3) RETURNING warehouse_id`,
        [projectId, styleId3, OWNER_USER_ID]
    );
});

after(async () => {
    await emptyAlmacenContentService(asOwner, { projectId });
    await pool.query(`DELETE FROM projects WHERE project_id = $1`, [projectId]);
    await pool.end();
});

test("Zod: bays/depth son enteros directos; las esquinas no aceptan decimales", () => {
    const base = { name: "A", corner1_x: 0, corner1_z: 0, corner2_x: 2, corner2_z: 1, bays: 2, depth: 1, levels: 2, direction: 0 };
    assert.equal(CreateRackBodySchema.safeParse(base).success, true);
    assert.equal(CreateRackBodySchema.safeParse({ ...base, corner2_x: 2.5 }).success, false, "esquina con decimales");
    assert.equal(CreateRackBodySchema.safeParse({ ...base, bays: 0 }).success, false, "bays tiene que ser positivo");
    assert.equal(CreateRackBodySchema.safeParse({ ...base, depth: 3 }).success, false, "depth solo admite 1 o 2");
});

test("crear: bays/depth directos (no derivados) y las esquinas solo dan la posición; genera sus casillas", async () => {
    const rack = await createRackService(asOwner, { projectId, warehouseId }, {
        name: "[test] estante A", corner1_x: 0, corner1_z: 0, corner2_x: 3, corner2_z: 1, bays: 3, depth: 1, levels: 2, direction: 0,
    });
    assert.equal(rack.bays, 3);
    assert.equal(rack.depth, 1);
    assert.equal(rack.corner1_x, 0);
    assert.equal(rack.corner2_x, 3);
    assert.equal(rack.bins.length, 3 * 2 * 1, "3 bahías x 2 niveles x 1 de profundidad");
    assert.deepEqual(new Set(rack.bins.map((b) => b.bay)), new Set([0, 1, 2]));
    assert.deepEqual(new Set(rack.bins.map((b) => b.face)), new Set([0]), "profundidad 1 = una sola cara");

    const listed = await listRacksService(asOwner, { projectId, warehouseId });
    assert.ok(listed.some((r) => r.rack_id === rack.rack_id));
});

test("crear: profundidad 2 genera casillas en las 2 caras", async () => {
    const rack = await createRackService(asOwner, { projectId, warehouseId }, {
        name: "[test] estante doble cara", corner1_x: 0, corner1_z: 5, corner2_x: 2, corner2_z: 7, bays: 2, depth: 2, levels: 1, direction: 0,
    });
    assert.equal(rack.bins.length, 2 * 1 * 2);
    assert.deepEqual(new Set(rack.bins.map((b) => b.face)), new Set([0, 1]));
});

test("crear: la diferencia entre esquinas tiene que coincidir EXACTO con bays (X) y depth (Z) — si no, 400 INVALID_CORNERS", async () => {
    await assert.rejects(
        createRackService(asOwner, { projectId, warehouseId }, {
            name: "[test] mal armado", corner1_x: 0, corner1_z: 12, corner2_x: 4, corner2_z: 13, bays: 3, depth: 1, levels: 1, direction: 0,
        }),
        codeOf("RACK_INVALID_CORNERS"), "el ancho real (4) no coincide con bays (3)"
    );
    await assert.rejects(
        createRackService(asOwner, { projectId, warehouseId }, {
            name: "[test] esquinas iguales", corner1_x: 0, corner1_z: 12, corner2_x: 0, corner2_z: 13, bays: 3, depth: 1, levels: 1, direction: 0,
        }),
        codeOf("RACK_INVALID_CORNERS"), "corner1_x == corner2_x"
    );
});

test("crear: fuera de la grilla del almacén (3x3) da 400 OUT_OF_GRID", async () => {
    await assert.rejects(
        createRackService(asOwner, { projectId, warehouseId: tinyWarehouseId }, {
            name: "[test] se sale", corner1_x: 1, corner1_z: 0, corner2_x: 4, corner2_z: 1, bays: 3, depth: 1, levels: 1, direction: 0,
        }),
        codeOf("RACK_OUT_OF_GRID"), "1 + 3 bahías = 4, se pasa del ancho de la grilla (3)"
    );
});

test("crear: más niveles que el estilo del almacén (max_level 3) da 400 EXCEEDS_MAX_LEVEL", async () => {
    await assert.rejects(
        createRackService(asOwner, { projectId, warehouseId }, {
            name: "[test] muy alto", corner1_x: 0, corner1_z: 14, corner2_x: 1, corner2_z: 15, bays: 1, depth: 1, levels: 4, direction: 0,
        }),
        codeOf("RACK_EXCEEDS_MAX_LEVEL")
    );
});

test("crear: 2 estantes sin 1 celda de pasillo libre chocan (409); con esa celda de por medio, se crean bien", async () => {
    // Vecino 1: ocupa z=[15,16). Mismo rango en X que los siguientes, para aislar el chequeo en Z.
    await createRackService(asOwner, { projectId, warehouseId }, {
        name: "[test] pasillo — vecino 1", corner1_x: 0, corner1_z: 15, corner2_x: 2, corner2_z: 16, bays: 2, depth: 1, levels: 1, direction: 0,
    });
    // Pegado al anterior (arranca justo donde termina, z=16: sin celda de pasillo).
    await assert.rejects(
        createRackService(asOwner, { projectId, warehouseId }, {
            name: "[test] pasillo — pegado", corner1_x: 0, corner1_z: 16, corner2_x: 2, corner2_z: 17, bays: 2, depth: 1, levels: 1, direction: 0,
        }),
        codeOf("RACK_NO_CLEARANCE")
    );
    // Con 1 celda de pasillo libre (arranca en z=17, deja z=[16,17) libre): se crea bien.
    const ok = await createRackService(asOwner, { projectId, warehouseId }, {
        name: "[test] pasillo — con espacio", corner1_x: 0, corner1_z: 17, corner2_x: 2, corner2_z: 18, bays: 2, depth: 1, levels: 1, direction: 0,
    });
    assert.equal(ok.bays, 2);
});

test("editar: solo renombra — bays, depth, esquinas y niveles no cambian; dar de baja libera el nombre", async () => {
    const rack = await createRackService(asOwner, { projectId, warehouseId }, {
        name: "[test] para renombrar", corner1_x: 0, corner1_z: 20, corner2_x: 1, corner2_z: 21, bays: 1, depth: 1, levels: 1, direction: 0,
    });
    const renamed = await updateRackService(asOwner, { projectId, warehouseId, rackId: rack.rack_id }, { name: "[test] ya renombrado" });
    assert.equal(renamed.name, "[test] ya renombrado");
    assert.equal(renamed.bays, 1);
    assert.equal(renamed.corner1_x, 0);
    assert.equal(renamed.corner1_z, 20);

    await deleteRackService(asOwner, { projectId, warehouseId, rackId: rack.rack_id });
    const afterDelete = await getRackByIdService(asOwner, { projectId, warehouseId, rackId: rack.rack_id }).catch((e) => e);
    assert.equal(afterDelete.response?.code, "RACK_NOT_FOUND");
});
