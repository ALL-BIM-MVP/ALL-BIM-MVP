import pool from "../db/database.js";
import { AppError } from "../models/errors/app-error.js";
import { IFC_CLASSIFICATION_ERRORS } from "../models/errors/ifc-classification.errors.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import type { ClassificationOverride, IfcClassificationConfigBody } from "../schemas/ifc-classification.schema.js";
import type {
    IfcClassificationConfigFull, IfcClassificationConfigRow, IfcClassificationFieldRow,
    IfcClassificationSnapshot,
} from "../models/ifc-classification.models.js";
import { assertModulePermission } from "./project-access.service.js";

// Mismo criterio que el resto del módulo Metrados — único módulo
// funcional hoy (ver ifc-metrados.service.ts).
const METRADOS_MODULE_CODE = "metrados";

// Sin fila propia = todavía nadie configuró nada para este proyecto —
// el default implícito es mode='norma', sin bloquear, sin campos.
const DEFAULT_CONFIG = (projectId: number): IfcClassificationConfigFull => ({
    project_id: projectId,
    mode: "norma",
    property_prefix: null,
    locked: false,
    updated_at: new Date(0),
    updated_by: null,
    fields: [],
});

export const getIfcClassificationConfigService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<IfcClassificationConfigFull> => {

    await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "view");

    const { rows } = await pool.query<IfcClassificationConfigRow>(
        `SELECT project_id, mode, property_prefix, locked, updated_at, updated_by
        FROM ifc_classification_configs WHERE project_id = $1`,
        [projectId]
    );
    const config = rows[0];
    if (!config) return DEFAULT_CONFIG(projectId);

    const { rows: fields } = await pool.query<IfcClassificationFieldRow>(
        `SELECT slot, code_property_set, code_property_name,
            description_property_set, description_property_name,
            unit_property_set, unit_property_name
        FROM ifc_classification_config_fields
        WHERE project_id = $1
        ORDER BY slot`,
        [projectId]
    );

    return { ...config, fields };
};

// Solo owner/admin (permiso 'configure', sembrado en Fase 2 justo para
// esto) — reemplaza TODA la config de una (mode + property_prefix +
// locked + el único slot=1 soportado hoy), no es un PATCH parcial.
export const upsertIfcClassificationConfigService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: IfcClassificationConfigBody
): Promise<IfcClassificationConfigFull> => {

    await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "configure");

    if (body.mode === "manual") {
        if (!body.property_prefix) throw new AppError(IFC_CLASSIFICATION_ERRORS.PREFIX_REQUIRED);
        if (!body.code_property_name) throw new AppError(IFC_CLASSIFICATION_ERRORS.FIELDS_REQUIRED);
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await client.query(
            `INSERT INTO ifc_classification_configs (project_id, mode, property_prefix, locked, updated_by)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (project_id) DO UPDATE
                SET mode = $2, property_prefix = $3, locked = $4, updated_by = $5, updated_at = NOW()`,
            [projectId, body.mode, body.mode === "manual" ? body.property_prefix : null, body.locked ?? false, user.user_id]
        );

        // v1: un solo slot — se reemplaza entero (DELETE + INSERT, mismo
        // patrón que module_role_permissions/metrado_template_columns).
        await client.query(`DELETE FROM ifc_classification_config_fields WHERE project_id = $1`, [projectId]);

        if (body.mode === "manual") {
            await client.query(
                `INSERT INTO ifc_classification_config_fields
                    (project_id, slot, code_property_set, code_property_name,
                     description_property_set, description_property_name,
                     unit_property_set, unit_property_name)
                VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
                [
                    projectId,
                    body.code_property_set ?? null, body.code_property_name,
                    body.description_property_set ?? null, body.description_property_name ?? null,
                    body.unit_property_set ?? null, body.unit_property_name ?? null,
                ]
            );
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return getIfcClassificationConfigService(user, { projectId });
};

export interface ResolvedClassification {
    // Lo que efectivamente hay que usar para ESTE procesamiento puntual
    // — o bien la config del proyecto tal cual (mode='norma' => null,
    // no hay nada que pasarle al pipeline), o un snapshot 'manual'
    // (default del proyecto, o el override, según corresponda).
    snapshot: IfcClassificationSnapshot | null;
}

// Resuelve qué clasificación usar al procesar UN archivo — llamado
// desde ifc-metrados.service.ts. Nunca lanza por "no hay config" (esa
// es una situación válida, implica modo 'norma'); SÍ lanza
// CONFIG_LOCKED si vino un override y la config del proyecto está
// bloqueada.
export const resolveClassificationForProcessing = async (
    projectId: number, override: ClassificationOverride | undefined
): Promise<ResolvedClassification> => {

    const { rows } = await pool.query<IfcClassificationConfigRow>(
        `SELECT project_id, mode, property_prefix, locked, updated_at, updated_by
        FROM ifc_classification_configs WHERE project_id = $1`,
        [projectId]
    );
    const config = rows[0];

    if (override) {
        if (config?.locked) throw new AppError(IFC_CLASSIFICATION_ERRORS.CONFIG_LOCKED);
        return {
            snapshot: {
                mode: "manual",
                property_prefix: override.property_prefix,
                code_property_set: override.code_property_set ?? null,
                code_property_name: override.code_property_name,
                description_property_set: override.description_property_set ?? null,
                description_property_name: override.description_property_name ?? null,
                unit_property_set: override.unit_property_set ?? null,
                unit_property_name: override.unit_property_name ?? null,
            },
        };
    }

    if (!config || config.mode === "norma") return { snapshot: null };

    const { rows: fields } = await pool.query<IfcClassificationFieldRow>(
        `SELECT code_property_set, code_property_name,
            description_property_set, description_property_name,
            unit_property_set, unit_property_name
        FROM ifc_classification_config_fields WHERE project_id = $1 AND slot = 1`,
        [projectId]
    );
    const field = fields[0];
    // No debería pasar (upsert exige code_property_name en modo manual),
    // pero si por lo que sea el proyecto quedó en 'manual' sin slot=1
    // cargado, no hay con qué clasificar — se cae a 'norma' en silencio
    // antes que reventar el procesamiento entero.
    if (!field || !config.property_prefix) return { snapshot: null };

    return {
        snapshot: {
            mode: "manual",
            property_prefix: config.property_prefix,
            code_property_set: field.code_property_set,
            code_property_name: field.code_property_name,
            description_property_set: field.description_property_set,
            description_property_name: field.description_property_name,
            unit_property_set: field.unit_property_set,
            unit_property_name: field.unit_property_name,
        },
    };
};
