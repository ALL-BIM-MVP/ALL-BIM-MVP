// categories — ver docs/roadmap/almacen-bim-base-datos.md 2.1. Para
// esta versión son exactamente 3 filas por proyecto, cerradas — nada
// de crear/editar/borrar categorías desde la app todavía (eso es
// Fase 5, a futuro, ver docs/roadmap/almacen-bim.md), por eso el único
// endpoint real de este archivo es LISTAR (Fase 3). Aparte,
// `createFixedCategoriesForProject` se llama desde adentro de
// projects.service.ts (createProjectService), dentro de la MISMA
// transacción que da de alta el proyecto — mismo criterio que ya usa
// esa función para anclar `ifc_classification_configs`/
// `elemento_conjunto_configs` desde el día uno. Reusable también para
// el backfill pendiente de proyectos que ya existían antes de este
// cambio (todavía no escrito, ver docs/roadmap/almacen-bim.md).
import pool from "../../db/database.js";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { CATEGORY_ERRORS } from "../../models/errors/almacen/category.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type { CategoryRow } from "../../models/almacen/category.models.js";

// "MAT"/"EQ" — el prefijo de Materiales lo confirmó el diseño como
// ejemplo explícito; el de Equipo nunca quedó fijado por escrito en
// ningún documento (el prototipo llegó a usar "EQP" en una versión más
// nueva, sin que quedara registrado como decisión) — se usa "EQ", el
// valor del prototipo más viejo/estable, a falta de una confirmación
// puntual. Cambiar cualquiera de los dos acá alcanza, no hay otro
// lugar donde estén hardcodeados.
const MATERIALS_PREFIX = "MAT";
const EQUIPMENT_PREFIX = "EQ";

export const createFixedCategoriesForProject = async (
    client: PoolClient, projectId: number, userId: number
): Promise<void> => {
    const { rows } = await client.query<{ category_id: number }>(
        `INSERT INTO categories (project_id, name, type, created_by)
        VALUES ($1, 'Partida', 'fijo', $2)
        RETURNING category_id`,
        [projectId, userId]
    );
    const basePartidaId = rows[0]!.category_id;

    await client.query(
        `INSERT INTO categories (project_id, name, type, prefix, base_category_id, created_by)
        VALUES
            ($1, 'Materiales', 'relacional', $2, $3, $4),
            ($1, 'Equipo', 'relacional', $5, $3, $4)`,
        [projectId, MATERIALS_PREFIX, basePartidaId, userId, EQUIPMENT_PREFIX]
    );
};

export const listCategoriesService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<CategoryRow[]> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "view");

    const { rows } = await pool.query<CategoryRow>(
        `SELECT * FROM categories WHERE project_id = $1 AND deleted_at IS NULL ORDER BY category_id`,
        [projectId]
    );
    return rows;
};

// Usado por product.service.ts al crear/editar un producto — valida
// que la categoría exista y sea de este proyecto antes de operar.
export const getCategoryRowOrThrow = async (
    client: Pool | PoolClient, projectId: number, categoryId: number
): Promise<CategoryRow> => {
    const { rows } = await client.query<CategoryRow>(
        `SELECT * FROM categories WHERE category_id = $1 AND project_id = $2 AND deleted_at IS NULL`,
        [categoryId, projectId]
    );
    const category = rows[0];
    if (!category) throw new AppError(CATEGORY_ERRORS.CATEGORY_NOT_FOUND);
    return category;
};
