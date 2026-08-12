import pool from "../db/database.js";
import type { PoolClient } from "pg";
import { AppError } from "../models/errors/app-error.js";
import { TEMPLATE_ERRORS } from "../models/errors/templates.errors.js";
import type { DecodedToken } from "../models/auth.models.js";
import type {
    CreateTemplateBody, ListTemplatesQuery, TemplateColumnIdParam, TemplateIdParam,
    ToggleColumnVisibilityBody, UpdateTemplateColumnsBody
} from "../schemas/templates.schema.js";
import {
    buildTemplateSets, type TemplateColumn, type TemplateColumnRow, type TemplateFull, type TemplateRow, type TemplateSetRow
} from "../models/templates.models.js";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

// Compartido por PUT /:id/columns y PATCH /:id/columns/:colId: una
// plantilla solo se puede editar si es propia (created_by = quien pide)
// y NO es del sistema — la default sembrada en system-data.sql nunca se
// toca por estos caminos. FOR UPDATE bloquea la fila por el resto de la
// transacción (evita que dos ediciones concurrentes de la misma
// plantilla se pisen a mitad de camino).
const assertTemplateEditable = async (
    client : PoolClient, templateId : number, userId : number
) : Promise<void> => {
    const result = await client.query(
        `SELECT template_id FROM metrado_templates
        WHERE template_id = $1 AND is_system = false AND created_by = $2
        FOR UPDATE`,
        [templateId, userId]
    );

    if (!result.rows[0]) throw new AppError(TEMPLATE_ERRORS.NOT_EDITABLE);
};

// Una plantilla es del sistema (is_system=true, visible para cualquier
// autenticado) o personal (created_by=dueño, visible solo para él) —
// no hay noción de proyecto acá, las plantillas no son por-proyecto.
export const getTemplateByIdService = async (
    user : DecodedToken, { templateId } : TemplateIdParam
) : Promise<TemplateFull> => {

    const templateResult = await pool.query<TemplateRow>(
        `SELECT template_id, name, description, is_system, is_default, created_by, created_at
        FROM metrado_templates
        WHERE template_id = $1 AND (is_system = true OR created_by = $2)`,
        [templateId, user.user_id]
    );

    const template = templateResult.rows[0];

    if (!template) throw new AppError(TEMPLATE_ERRORS.NOT_FOUND);

    const setsResult = await pool.query<TemplateSetRow>(
        `SELECT template_set_id, name, sort_order
        FROM metrado_template_sets
        WHERE template_id = $1`,
        [templateId]
    );

    const columnsResult = await pool.query<TemplateColumnRow>(
        `SELECT c.template_column_id, c.template_set_id, c.name, c.source_type, c.builtin_field,
            c.property_set_name, c.property_name, c.column_order, c.is_visible
        FROM metrado_template_columns c
        INNER JOIN metrado_template_sets s USING(template_set_id)
        WHERE s.template_id = $1`,
        [templateId]
    );

    return { ...template, sets: buildTemplateSets(setsResult.rows, columnsResult.rows) };
};

export const createTemplateService = async (
    user : DecodedToken, body : CreateTemplateBody
) : Promise<TemplateFull> => {

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // Siempre is_system=false/is_default=false y created_by=quien la
        // crea — "guardar como nueva" es explícitamente una plantilla
        // personal, nunca pisa la del sistema.
        const inserted = await client.query<{ template_id : number }>(
            `INSERT INTO metrado_templates (name, description, is_system, is_default, created_by)
            VALUES ($1, $2, false, false, $3)
            RETURNING template_id`,
            [body.name, body.description ?? null, user.user_id]
        );
        const templateId = inserted.rows[0]!.template_id;

        for (const set of body.sets) {
            const insertedSet = await client.query<{ template_set_id : number }>(
                `INSERT INTO metrado_template_sets (template_id, name, sort_order)
                VALUES ($1, $2, $3)
                RETURNING template_set_id`,
                [templateId, set.name, set.sort_order]
            );
            const templateSetId = insertedSet.rows[0]!.template_set_id;

            for (const col of set.columns) {
                await client.query(
                    `INSERT INTO metrado_template_columns
                        (template_set_id, name, source_type, builtin_field, property_set_name, property_name, column_order, is_visible)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                    [
                        templateSetId,
                        col.name,
                        col.source_type,
                        col.source_type === "builtin" ? col.builtin_field : null,
                        col.source_type === "ifc_property" ? col.property_set_name : null,
                        col.source_type === "ifc_property" ? col.property_name : null,
                        col.column_order,
                        col.is_visible ?? true
                    ]
                );
            }
        }

        await client.query("COMMIT");

        // Se re-lee ya committeada (fuera del client de la transacción)
        // para devolver exactamente la misma forma anidada que GET
        // /templates/:id — mismo criterio que otros services que
        // re-fetchean después de un INSERT en vez de armar la respuesta
        // a mano (ej. updateProjectMemberRoleService).
        return await getTemplateByIdService(user, { templateId });
    } catch (error) {
        await client.query("ROLLBACK");
        const code = (error as { code? : string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(TEMPLATE_ERRORS.NAME_OR_STRUCTURE_CONFLICT);
        if (code === FOREIGN_KEY_VIOLATION) throw new AppError(TEMPLATE_ERRORS.INVALID_BUILTIN_FIELD);
        throw error;
    } finally {
        client.release();
    }
};

// Listado liviano (sin sets/columnas anidadas) para pickers — el
// detalle completo sigue siendo GET /:templateId. Mismo criterio de
// acceso que ese endpoint (is_system OR created_by), pero acá se puede
// acotar con ?scope=.
export const listTemplatesService = async (
    user : DecodedToken, { scope = "all" } : ListTemplatesQuery
) : Promise<TemplateRow[]> => {

    let whereClause : string;
    let params : number[];

    if (scope === "system") {
        whereClause = "is_system = true";
        params = [];
    } else if (scope === "mine") {
        whereClause = "created_by = $1";
        params = [user.user_id];
    } else {
        whereClause = "(is_system = true OR created_by = $1)";
        params = [user.user_id];
    }

    const result = await pool.query<TemplateRow>(
        `SELECT template_id, name, description, is_system, is_default, created_by, created_at
        FROM metrado_templates
        WHERE ${whereClause}
        ORDER BY is_default DESC, is_system DESC, name`,
        params
    );

    return result.rows;
};

// Reemplaza TODA la estructura de sets+columnas de una plantilla propia
// ya existente. No hay diff campo por campo: se borran los sets viejos
// (ON DELETE CASCADE se lleva las columnas) y se insertan de cero,
// mismo criterio que force=true en el procesamiento de IFC — más
// simple, y el frontend igual manda la estructura completa (viene de
// una plantilla que ya cargó entera con GET /:id).
export const updateTemplateColumnsService = async (
    user : DecodedToken, { templateId } : TemplateIdParam, body : UpdateTemplateColumnsBody
) : Promise<TemplateFull> => {

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await assertTemplateEditable(client, templateId, user.user_id);

        await client.query(`DELETE FROM metrado_template_sets WHERE template_id = $1`, [templateId]);

        for (const set of body.sets) {
            const insertedSet = await client.query<{ template_set_id : number }>(
                `INSERT INTO metrado_template_sets (template_id, name, sort_order)
                VALUES ($1, $2, $3)
                RETURNING template_set_id`,
                [templateId, set.name, set.sort_order]
            );
            const templateSetId = insertedSet.rows[0]!.template_set_id;

            for (const col of set.columns) {
                await client.query(
                    `INSERT INTO metrado_template_columns
                        (template_set_id, name, source_type, builtin_field, property_set_name, property_name, column_order, is_visible)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                    [
                        templateSetId,
                        col.name,
                        col.source_type,
                        col.source_type === "builtin" ? col.builtin_field : null,
                        col.source_type === "ifc_property" ? col.property_set_name : null,
                        col.source_type === "ifc_property" ? col.property_name : null,
                        col.column_order,
                        col.is_visible ?? true
                    ]
                );
            }
        }

        await client.query("COMMIT");

        return await getTemplateByIdService(user, { templateId });
    } catch (error) {
        await client.query("ROLLBACK");
        const code = (error as { code? : string }).code;
        if (code === UNIQUE_VIOLATION) throw new AppError(TEMPLATE_ERRORS.NAME_OR_STRUCTURE_CONFLICT);
        if (code === FOREIGN_KEY_VIOLATION) throw new AppError(TEMPLATE_ERRORS.INVALID_BUILTIN_FIELD);
        throw error;
    } finally {
        client.release();
    }
};

// Toggle puntual de una sola columna (ocultar/mostrar) sin tener que
// reenviar la plantilla entera — pensado para el ícono de "ojo" en la
// UI. Reusa assertTemplateEditable para el mismo chequeo de propiedad,
// y aparte valida que la columna pedida sea realmente de esta plantilla
// (columnId no alcanza por sí solo, es global entre plantillas).
export const toggleTemplateColumnVisibilityService = async (
    user : DecodedToken, { templateId, columnId } : TemplateColumnIdParam, body : ToggleColumnVisibilityBody
) : Promise<TemplateColumn> => {

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        await assertTemplateEditable(client, templateId, user.user_id);

        const result = await client.query<TemplateColumn>(
            `UPDATE metrado_template_columns c
            SET is_visible = $1
            FROM metrado_template_sets s
            WHERE c.template_set_id = s.template_set_id
                AND s.template_id = $2
                AND c.template_column_id = $3
            RETURNING c.template_column_id, c.name, c.source_type, c.builtin_field,
                c.property_set_name, c.property_name, c.column_order, c.is_visible`,
            [body.is_visible, templateId, columnId]
        );

        const column = result.rows[0];

        if (!column) throw new AppError(TEMPLATE_ERRORS.COLUMN_NOT_FOUND);

        await client.query("COMMIT");

        return column;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
};
