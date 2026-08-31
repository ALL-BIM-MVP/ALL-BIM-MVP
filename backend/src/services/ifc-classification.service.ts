import pool from "../db/database.js";
import { AppError } from "../models/errors/app-error.js";
import { IFC_CLASSIFICATION_ERRORS } from "../models/errors/ifc-classification.errors.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import type { ClassificationOverride, IfcClassificationConfigBody } from "../schemas/ifc-classification.schema.js";
import type {
    IfcClassificationConfigFull, IfcClassificationConfigRow, IfcClassificationFieldRow,
    IfcClassificationMode, IfcClassificationSnapshot,
} from "../models/ifc-classification.models.js";
import { assertModulePermission, assertProjectAdmin } from "./project-access.service.js";

// Mismo criterio que el resto del módulo Metrados — único módulo
// funcional hoy (ver ifc-metrados.service.ts).
const METRADOS_MODULE_CODE = "metrados";

// Sin fila propia = todavía nadie configuró nada para este proyecto —
// el default implícito es mode='norma', sin prefijo, sin bloquear.
// En la práctica esto ya no debería pasar (POST /projects crea la fila
// siempre, ver projects.service.ts) — queda como red de seguridad.
const DEFAULT_CONFIG = (projectId: number): IfcClassificationConfigFull => ({
    project_id: projectId,
    mode: "norma",
    mode_locked: false,
    property_prefix: null,
    property_prefix_locked: false,
    updated_at: new Date(0),
    updated_by: null,
    fields: [],
});

export const getIfcClassificationConfigService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<IfcClassificationConfigFull> => {

    await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "view");

    const { rows } = await pool.query<IfcClassificationConfigRow>(
        `SELECT project_id, mode, mode_locked, property_prefix, property_prefix_locked, updated_at, updated_by
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

// El permiso 'configure' se puede asignar a cualquier miembro del
// proyecto (module_role, no necesariamente owner/admin — ver el
// comentario largo junto a LOCK_PERMISSION_REQUIRED) — alcanza para
// editar mode/property_prefix/campos, pero mode_locked/
// property_prefix_locked (los candados) están reservados a
// owner/admin real: se verifica más abajo, comparando contra lo que
// ya había guardado, ANTES de tocar nada — reemplaza TODA la config de
// una (no es un PATCH parcial), pero eso no incluye colarse un cambio
// de candado sin permiso.
export const upsertIfcClassificationConfigService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: IfcClassificationConfigBody
): Promise<IfcClassificationConfigFull> => {

    await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "configure");

    if (body.mode === "manual" && !body.code_property_name) {
        throw new AppError(IFC_CLASSIFICATION_ERRORS.FIELDS_REQUIRED);
    }

    const { rows: currentRows } = await pool.query<{ mode_locked: boolean; property_prefix_locked: boolean }>(
        `SELECT mode_locked, property_prefix_locked FROM ifc_classification_configs WHERE project_id = $1`,
        [projectId]
    );
    const currentModeLocked = currentRows[0]?.mode_locked ?? false;
    const currentPrefixLocked = currentRows[0]?.property_prefix_locked ?? false;
    const wantsLockChange =
        (body.mode_locked ?? false) !== currentModeLocked ||
        (body.property_prefix_locked ?? false) !== currentPrefixLocked;

    if (wantsLockChange) {
        await assertProjectAdmin(projectId, user.user_id).catch(() => {
            throw new AppError(IFC_CLASSIFICATION_ERRORS.LOCK_PERMISSION_REQUIRED);
        });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        await client.query(
            `INSERT INTO ifc_classification_configs
                (project_id, mode, mode_locked, property_prefix, property_prefix_locked, updated_by)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (project_id) DO UPDATE
                SET mode = $2, mode_locked = $3, property_prefix = $4, property_prefix_locked = $5,
                    updated_by = $6, updated_at = NOW()`,
            [
                projectId, body.mode, body.mode_locked ?? false,
                body.property_prefix ?? null, body.property_prefix_locked ?? false,
                user.user_id,
            ]
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
    // SIEMPRE un objeto — mode y property_prefix se resuelven de forma
    // independiente, "todo por defecto" (norma, sin prefijo) es un
    // resultado válido, no un "no hay nada que resolver".
    snapshot: IfcClassificationSnapshot;
}

// Resuelve qué clasificación usar al procesar UN archivo — llamado
// desde ifc-metrados.service.ts. mode y property_prefix se resuelven
// cada uno por su cuenta: el override puede traer uno, el otro, los
// dos, o ninguno — cada parte respeta SU PROPIO lock, no hay un lock
// grupal que bloquee todo junto.
export const resolveClassificationForProcessing = async (
    projectId: number, override: ClassificationOverride | undefined
): Promise<ResolvedClassification> => {

    const { rows } = await pool.query<IfcClassificationConfigRow>(
        `SELECT project_id, mode, mode_locked, property_prefix, property_prefix_locked, updated_at, updated_by
        FROM ifc_classification_configs WHERE project_id = $1`,
        [projectId]
    );
    const config = rows[0];

    // --- resolver MODE (+ los campos de clasificación que dependen de él) ---
    let mode: IfcClassificationMode = config?.mode ?? "norma";
    let codeSet: string | null = null;
    let codeName: string | null = null;
    let descSet: string | null = null;
    let descName: string | null = null;
    let unitSet: string | null = null;
    let unitName: string | null = null;

    if (override?.mode === "manual") {
        if (config?.mode_locked) throw new AppError(IFC_CLASSIFICATION_ERRORS.MODE_LOCKED);
        mode = "manual";
        codeSet = override.code_property_set ?? null;
        codeName = override.code_property_name ?? null;
        descSet = override.description_property_set ?? null;
        descName = override.description_property_name ?? null;
        unitSet = override.unit_property_set ?? null;
        unitName = override.unit_property_name ?? null;
    } else if (mode === "manual") {
        const { rows: fields } = await pool.query<IfcClassificationFieldRow>(
            `SELECT code_property_set, code_property_name,
                description_property_set, description_property_name,
                unit_property_set, unit_property_name
            FROM ifc_classification_config_fields WHERE project_id = $1 AND slot = 1`,
            [projectId]
        );
        const field = fields[0];
        if (field) {
            codeSet = field.code_property_set;
            codeName = field.code_property_name;
            descSet = field.description_property_set;
            descName = field.description_property_name;
            unitSet = field.unit_property_set;
            unitName = field.unit_property_name;
        } else {
            // No debería pasar (el upsert exige code_property_name en
            // modo manual), pero si el proyecto quedó en 'manual' sin
            // slot=1 cargado, no hay con qué clasificar — se cae a
            // 'norma' en silencio antes que reventar el procesamiento.
            mode = "norma";
        }
    }

    // --- resolver PROPERTY_PREFIX, independiente de mode ---
    let propertyPrefix: string | null = config?.property_prefix ?? null;
    if (override?.property_prefix !== undefined) {
        if (config?.property_prefix_locked) throw new AppError(IFC_CLASSIFICATION_ERRORS.PREFIX_LOCKED);
        propertyPrefix = override.property_prefix || null; // "" también cuenta como "sin prefijo"
    }

    return {
        snapshot: {
            mode,
            property_prefix: propertyPrefix,
            code_property_set: codeSet,
            code_property_name: codeName,
            description_property_set: descSet,
            description_property_name: descName,
            unit_property_set: unitSet,
            unit_property_name: unitName,
        },
    };
};
