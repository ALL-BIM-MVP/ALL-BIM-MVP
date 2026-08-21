// project-access.service.ts
//
// Autorización de proyecto — Fase 2 (docs/roadmap-modulos-y-permisos.md).
// Dos niveles, resueltos acá:
//   1) Administración del proyecto: owner o project_members.is_admin,
//      acceso total, SIN pasar por module_roles (ver assertProjectAdmin).
//   2) Trabajo dentro de un módulo puntual: resuelto por
//      resolveModuleAccess/assertModulePermission — owner/admin siguen
//      pasando siempre (bypass), todo lo demás depende del module_role
//      que tenga asignado el miembro para ESE módulo puntual (o el
//      mínimo "solo ver" por defecto si no tiene ninguno asignado).
import pool from "../db/database.js";
import { AppError } from "../models/errors/app-error.js";
import { PROJECT_ERRORS } from "../models/errors/project.errors.js";
import { PERMISSION_ERRORS } from "../models/errors/permission.errors.js";
import { MODULE_ERRORS } from "../models/errors/modules.errors.js";
import type { ModuleAccess, PermissionMap } from "../models/modules.models.js";
import { assertProjectAccess } from "./files.service.js";

export { assertProjectAccess };

// Dueño o is_admin=true — acceso TOTAL al proyecto (miembros,
// invitaciones, configuración), sin consultar ninguna tabla de
// módulos. Ver el comentario de is_admin en database/schema.sql para
// el porqué de que sea un bypass de código y no una asignación
// implícita de rol.
export const assertProjectAdmin = async (projectId : number, userId : number) : Promise<void> => {
    const result = await pool.query(
        `SELECT 1 FROM projects p
            WHERE p.project_id = $1 AND (
                p.owner_id = $2
                OR EXISTS (
                    SELECT 1 FROM project_members pm
                    WHERE pm.project_id = p.project_id AND pm.user_id = $2 AND pm.is_admin = true
                )
            )`,
        [projectId, userId]
    );
    if (result.rowCount === 0) throw new AppError(PERMISSION_ERRORS.ADMIN_PERMISSION_REQUIRED);
};

// Catálogo completo de permisos como mapa con TODO en false — base
// sobre la que se van prendiendo los que el rol sí otorga, así la
// respuesta siempre trae las mismas 6 claves sin importar cuántas
// tenga el rol resuelto.
const emptyPermissionMap = async () : Promise<PermissionMap> => {
    const result = await pool.query<{ code : string }>(`SELECT code FROM module_permissions`);
    const map : PermissionMap = {};
    for (const { code } of result.rows) map[code] = false;
    return map;
};

const allPermissionsTrue = async () : Promise<PermissionMap> => {
    const map = await emptyPermissionMap();
    for (const code of Object.keys(map)) map[code] = true;
    return map;
};

// Punto de entrada único para "¿qué puede hacer este usuario en este
// módulo de este proyecto?" — usado tanto por el endpoint de acceso
// (GET .../modules/:code/access) como por assertModulePermission acá
// abajo. Nunca lanza por falta de permiso (a diferencia de
// assertModulePermission) — SÍ lanza si el proyecto/módulo no existen,
// o si el usuario no es owner/miembro de este proyecto en absoluto.
export const resolveModuleAccess = async (
    projectId : number, userId : number, moduleCode : string
) : Promise<ModuleAccess> => {

    const moduleResult = await pool.query<{ module_id : number; is_active : boolean }>(
        `SELECT module_id, is_active FROM modules WHERE code = $1`,
        [moduleCode]
    );
    const moduleRow = moduleResult.rows[0];
    if (!moduleRow) throw new AppError(MODULE_ERRORS.MODULE_NOT_FOUND);
    if (!moduleRow.is_active) throw new AppError(MODULE_ERRORS.MODULE_NOT_ACTIVE);

    const memberResult = await pool.query<{ is_owner : boolean; project_member_id : number | null; is_admin : boolean | null }>(
        `SELECT
            (p.owner_id = $2) AS is_owner,
            pm.project_member_id,
            pm.is_admin
        FROM projects p
        LEFT JOIN project_members pm ON pm.project_id = p.project_id AND pm.user_id = $2
        WHERE p.project_id = $1 AND (p.owner_id = $2 OR pm.user_id = $2)
        LIMIT 1`,
        [projectId, userId]
    );
    const member = memberResult.rows[0];
    if (!member) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);

    const isOwner = member.is_owner;
    const isAdmin = member.is_admin === true;

    if (isOwner || isAdmin) {
        return {
            module_code: moduleCode, is_owner: isOwner, is_admin: isAdmin,
            module_role_id: null, role_name: null,
            permissions: await allPermissionsTrue(),
        };
    }

    const roleResult = await pool.query<{ module_role_id : number; name : string; code : string }>(
        `SELECT mr.module_role_id, mr.name, mp.code
        FROM project_member_module_roles pmmr
        INNER JOIN module_roles mr USING(module_role_id)
        INNER JOIN module_role_permissions mrp USING(module_role_id)
        INNER JOIN module_permissions mp USING(module_permission_id)
        WHERE pmmr.project_member_id = $1 AND pmmr.module_id = $2`,
        [member.project_member_id, moduleRow.module_id]
    );

    if (roleResult.rows.length > 0) {
        const permissions = await emptyPermissionMap();
        for (const row of roleResult.rows) permissions[row.code] = true;
        return {
            module_code: moduleCode, is_owner: false, is_admin: false,
            module_role_id: roleResult.rows[0]!.module_role_id, role_name: roleResult.rows[0]!.name,
            permissions,
        };
    }

    // Sin module_role asignado -> mínimo por defecto: puede ver, sin
    // cambiar nada, en cualquier módulo (ver comentario en
    // project_member_module_roles, database/schema.sql).
    const permissions = await emptyPermissionMap();
    permissions.view = true;
    return {
        module_code: moduleCode, is_owner: false, is_admin: false,
        module_role_id: null, role_name: null,
        permissions,
    };
};

export const assertModulePermission = async (
    projectId : number, userId : number, moduleCode : string, permissionCode : string
) : Promise<void> => {
    const access = await resolveModuleAccess(projectId, userId, moduleCode);
    if (!access.permissions[permissionCode]) throw new AppError(PERMISSION_ERRORS.INSUFFICIENT_PERMISSIONS);
};
