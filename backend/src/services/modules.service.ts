import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ModuleCodeParam, ProjectModuleCodeParam } from "../schemas/modules.schema.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import type { ModuleAccess, ModuleRoleCatalogEntry, ModuleSummary, PermissionMap } from "../models/modules.models.js";
import { AppError } from "../models/errors/app-error.js";
import { MODULE_ERRORS } from "../models/errors/modules.errors.js";
import { resolveModuleAccess } from "./project-access.service.js";

export const getModulesService = async () : Promise<ModuleSummary[]> => {
    const result = await pool.query<ModuleSummary>(
        `SELECT module_id, code, name, is_active FROM modules ORDER BY module_id`
    );
    return result.rows;
};

// Catálogo de roles de UN módulo — nombre + descripción + mapa de
// permisos completo (todas las claves, false las que no otorga). No
// depende de ningún proyecto (los roles son fijos por módulo, no por
// proyecto todavía) — sirve tanto para el tooltip "¿qué significa este
// rol?" como para poblar el selector al asignar/invitar.
export const getModuleRolesService = async ({ moduleCode } : ModuleCodeParam) : Promise<ModuleRoleCatalogEntry[]> => {
    const moduleResult = await pool.query<{ module_id : number }>(
        `SELECT module_id FROM modules WHERE code = $1`, [moduleCode]
    );
    const moduleRow = moduleResult.rows[0];
    if (!moduleRow) throw new AppError(MODULE_ERRORS.MODULE_NOT_FOUND);

    const allPermsResult = await pool.query<{ code : string }>(`SELECT code FROM module_permissions ORDER BY code`);
    const allCodes = allPermsResult.rows.map((r) => r.code);

    const rolesResult = await pool.query<{
        module_role_id : number; name : string; description : string | null; granted_codes : string[] | null;
    }>(
        `SELECT mr.module_role_id, mr.name, mr.description,
            ARRAY_AGG(mp.code) FILTER (WHERE mp.code IS NOT NULL) AS granted_codes
        FROM module_roles mr
        LEFT JOIN module_role_permissions mrp USING(module_role_id)
        LEFT JOIN module_permissions mp USING(module_permission_id)
        WHERE mr.module_id = $1
        GROUP BY mr.module_role_id, mr.name, mr.description
        ORDER BY mr.module_role_id`,
        [moduleRow.module_id]
    );

    return rolesResult.rows.map((row) => {
        const granted = new Set(row.granted_codes ?? []);
        const permissions : PermissionMap = {};
        for (const code of allCodes) permissions[code] = granted.has(code);
        return {
            module_role_id: row.module_role_id, module_id: moduleRow.module_id,
            name: row.name, description: row.description, permissions,
        };
    });
};

// GET /projects/:id/modules/:moduleCode/access — lo que se pide al
// ENTRAR a un módulo puntual (ver diseño: no hace falta pedir los 6 de
// antemano porque hoy el mínimo es "ver" en todos).
export const getModuleAccessService = async (
    user : DecodedToken, { projectId, moduleCode } : ProjectModuleCodeParam
) : Promise<ModuleAccess> => {
    return resolveModuleAccess(projectId, user.user_id, moduleCode);
};

// GET /projects/:id/my-modules — los 6 de una (reservado para cuando
// haga falta ocultar módulos enteros a ciertos usuarios, ver roadmap).
// Los módulos is_active=false igual aparecen (con permisos todo en
// false salvo que seas owner/admin) — el frontend decide si mostrarlos
// como "próximamente" o esconderlos.
export const getMyModulesAccessService = async (
    user : DecodedToken, { projectId } : ProjectIdParam
) : Promise<ModuleAccess[]> => {
    const modulesResult = await pool.query<{ code : string; is_active : boolean }>(
        `SELECT code, is_active FROM modules ORDER BY module_id`
    );

    const results : ModuleAccess[] = [];
    for (const { code, is_active } of modulesResult.rows) {
        if (!is_active) continue; // ver comentario de MODULE_NOT_ACTIVE — todavía no hay nada que resolver acá
        results.push(await resolveModuleAccess(projectId, user.user_id, code));
    }
    return results;
};
