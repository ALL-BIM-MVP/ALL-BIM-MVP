// elemento-conjunto.service.ts
//
// Config por proyecto de qué campos componen la clave de "elemento
// conjunto" (ver models/elemento-conjunto.models.ts para el porqué).
// Mismo criterio general que ifc-classification.service.ts: reemplazo
// total en el PUT (no PATCH parcial), permiso 'configure' del módulo
// metrados para escribir, 'view' para leer.
import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import type { ElementoConjuntoConfigBody } from "../schemas/elemento-conjunto.schema.js";
import {
    ELEMENTO_CONJUNTO_BUILTIN_LABELS,
    type AvailableElementoConjuntoFields, type ElementoConjuntoBuiltinField,
    type ElementoConjuntoConfigFull, type ElementoConjuntoConfigRow, type ElementoConjuntoFieldRow,
} from "../models/elemento-conjunto.models.js";
import { assertModulePermission } from "./project-access.service.js";

const METRADOS_MODULE_CODE = "metrados";

// Los 4 builtin, en un orden fijo estable — es el default con el que
// se crea todo proyecto nuevo (ver projects.service.ts), y también lo
// que arma este service como red de seguridad si por lo que sea un
// proyecto (viejo, de antes de esta funcionalidad) no tiene fila.
const DEFAULT_BUILTIN_ORDER: ElementoConjuntoBuiltinField[] = ["file_name", "global_id", "tag", "partida_code"];

const DEFAULT_FIELDS: ElementoConjuntoFieldRow[] = DEFAULT_BUILTIN_ORDER.map((builtin_field, i) => ({
    position: i + 1, field_type: "builtin", builtin_field, property_set: null, property_name: null,
}));

const DEFAULT_CONFIG = (projectId: number): ElementoConjuntoConfigFull => ({
    project_id: projectId, updated_at: new Date(0), updated_by: null, fields: DEFAULT_FIELDS,
});

export const getElementoConjuntoConfigService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<ElementoConjuntoConfigFull> => {

    await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "view");

    const { rows } = await pool.query<ElementoConjuntoConfigRow>(
        `SELECT project_id, updated_at, updated_by FROM elemento_conjunto_configs WHERE project_id = $1`,
        [projectId]
    );
    const config = rows[0];
    if (!config) return DEFAULT_CONFIG(projectId);

    const { rows: fields } = await pool.query<ElementoConjuntoFieldRow>(
        `SELECT position, field_type, builtin_field, property_set, property_name
        FROM elemento_conjunto_config_fields
        WHERE project_id = $1
        ORDER BY position`,
        [projectId]
    );

    return { ...config, fields };
};

export const upsertElementoConjuntoConfigService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: ElementoConjuntoConfigBody
): Promise<ElementoConjuntoConfigFull> => {

    await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "configure");

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await client.query(
            `INSERT INTO elemento_conjunto_configs (project_id, updated_by)
            VALUES ($1, $2)
            ON CONFLICT (project_id) DO UPDATE SET updated_by = $2, updated_at = NOW()`,
            [projectId, user.user_id]
        );

        // Reemplazo total (DELETE + INSERT), mismo patrón que
        // ifc_classification_config_fields/metrado_template_columns.
        await client.query(`DELETE FROM elemento_conjunto_config_fields WHERE project_id = $1`, [projectId]);

        let position = 0;
        for (const field of body.fields) {
            position += 1;
            if (field.field_type === "builtin") {
                await client.query(
                    `INSERT INTO elemento_conjunto_config_fields (project_id, position, field_type, builtin_field)
                    VALUES ($1, $2, 'builtin', $3)`,
                    [projectId, position, field.builtin_field]
                );
            } else {
                await client.query(
                    `INSERT INTO elemento_conjunto_config_fields
                        (project_id, position, field_type, property_set, property_name)
                    VALUES ($1, $2, 'property', $3, $4)`,
                    [projectId, position, field.property_set ?? null, field.property_name]
                );
            }
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return getElementoConjuntoConfigService(user, { projectId });
};

// Catálogo para armar el selector en el frontend — los 4 builtin
// (fijos) + el UNION de property_set/property_name que EXISTAN en
// algún ifc_file vigente (is_current=true) del proyecto, sin importar
// de qué documento/especialidad vengan.
export const getAvailableElementoConjuntoFieldsService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<AvailableElementoConjuntoFields> => {

    await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "view");

    const builtin = DEFAULT_BUILTIN_ORDER.map((builtin_field) => ({
        builtin_field, label: ELEMENTO_CONJUNTO_BUILTIN_LABELS[builtin_field],
    }));

    const { rows: ifc_properties } = await pool.query<{ property_set: string; property_name: string }>(
        `SELECT DISTINCT p.property_set, p.property_name
        FROM ifc_properties p
        JOIN ifc_files ifl ON ifl.ifc_file_id = p.ifc_file_id
        JOIN files fl ON fl.file_id = ifl.ifc_file_id
        WHERE fl.project_id = $1 AND ifl.is_current = true
        ORDER BY p.property_set, p.property_name`,
        [projectId]
    );

    return { builtin, ifc_properties };
};
