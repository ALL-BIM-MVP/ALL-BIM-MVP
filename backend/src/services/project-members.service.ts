import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import type {
    ProjectMemberIdParam, ProjectMemberModuleParam, ProjectMemberUserParam,
    SetMemberAdminData, SetMemberModuleRoleData,
} from "../schemas/project-members.schema.js";
import {
    transformMemberToListItem, type ProjectMemberListItem, type ProjectMemberRow,
} from "../models/project-members.models.js";
import { toProfilePictureUrl } from "../models/users.models.js";
import { AppError } from "../models/errors/app-error.js";
import { PROJECT_ERRORS } from "../models/errors/project.errors.js";
import { PROJECT_MEMBER_ERRORS } from "../models/errors/project-members.errors.js";
import { MODULE_ERRORS } from "../models/errors/modules.errors.js";
import { assertProjectAccess, assertProjectAdmin } from "./project-access.service.js";

// Cualquier miembro (u owner) puede LEER la lista — no es información
// sensible, es común poder ver con quién trabajás en un proyecto.
// Gestionar (admin/módulo/eliminar) sí sigue restringido, ver más abajo.
export const getListProjectMembersService = async (
    { user_id : currentUserId } : DecodedToken, { projectId } : ProjectIdParam
) : Promise<ProjectMemberListItem[]> => {

    await assertProjectAccess(projectId, currentUserId);

    const ownerResult = await pool.query<{
        owner_id : number; user_name : string; user_last_name : string | null;
        user_email : string; profile_picture_path : string | null; created_at : Date;
    }>(
        `SELECT p.owner_id, u.name AS user_name, u.last_name AS user_last_name,
            u.email AS user_email, u.profile_picture_path, p.created_at
        FROM projects p
        INNER JOIN users u ON u.user_id = p.owner_id
        WHERE p.project_id = $1`,
        [projectId]
    );
    const owner = ownerResult.rows[0];
    if (!owner) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);

    const membersResult = await pool.query<ProjectMemberRow>(
        `SELECT pm.project_member_id, pm.joined_at, pm.project_id,
            u.user_id, u.name AS user_name, u.last_name AS user_last_name,
            u.email AS user_email, u.profile_picture_path, pm.is_admin,
            COALESCE(
                JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'module_code', m.code, 'module_name', m.name,
                        'module_role_id', mr.module_role_id, 'role_name', mr.name
                    )
                ) FILTER (WHERE mr.module_role_id IS NOT NULL),
                '[]'
            ) AS module_roles
        FROM project_members pm
        INNER JOIN users u USING(user_id)
        LEFT JOIN project_member_module_roles pmmr ON pmmr.project_member_id = pm.project_member_id
        LEFT JOIN module_roles mr ON mr.module_role_id = pmmr.module_role_id
        LEFT JOIN modules m ON m.module_id = pmmr.module_id
        WHERE pm.project_id = $1
        GROUP BY pm.project_member_id, pm.joined_at, pm.project_id, u.user_id, u.name, u.last_name,
            u.email, u.profile_picture_path, pm.is_admin
        ORDER BY pm.joined_at DESC`,
        [projectId]
    );

    const ownerRow : ProjectMemberListItem = {
        project_member_id: null,
        user_id: owner.owner_id,
        user_name: owner.user_name,
        user_last_name: owner.user_last_name,
        email: owner.user_email,
        profile_picture_url: toProfilePictureUrl(owner.profile_picture_path),
        is_owner: true,
        is_admin: true,
        is_me: owner.owner_id === currentUserId,
        joined_at: owner.created_at,
        module_roles: [],
    };

    return [ownerRow, ...membersResult.rows.map((row) => transformMemberToListItem(row, currentUserId))];
};

// PATCH /:projectId/members/:memberId/admin — solo owner/admin.
export const setMemberAdminService = async (
    { user_id : actingUserId } : DecodedToken, { projectId, memberId } : ProjectMemberIdParam,
    { is_admin } : SetMemberAdminData
) : Promise<void> => {

    await assertProjectAdmin(projectId, actingUserId);

    const result = await pool.query(
        `UPDATE project_members SET is_admin = $1 WHERE project_member_id = $2 AND project_id = $3`,
        [is_admin, memberId, projectId]
    );
    if (result.rowCount === 0) throw new AppError(PROJECT_MEMBER_ERRORS.NOT_FOUND);
};

// PUT /:projectId/members/:memberId/modules/:moduleCode/role — solo
// owner/admin. Asigna (o reemplaza, ON CONFLICT) el module_role de ESE
// miembro para ESE módulo — un miembro tiene como mucho un rol por
// módulo (UNIQUE(project_member_id, module_id), ver schema.sql).
export const setMemberModuleRoleService = async (
    { user_id : actingUserId } : DecodedToken, { projectId, memberId, moduleCode } : ProjectMemberModuleParam,
    { module_role_id : moduleRoleId } : SetMemberModuleRoleData
) : Promise<void> => {

    await assertProjectAdmin(projectId, actingUserId);

    const memberCheck = await pool.query(
        `SELECT 1 FROM project_members WHERE project_member_id = $1 AND project_id = $2`,
        [memberId, projectId]
    );
    if (memberCheck.rowCount === 0) throw new AppError(PROJECT_MEMBER_ERRORS.NOT_FOUND);

    const moduleResult = await pool.query<{ module_id : number }>(
        `SELECT module_id FROM modules WHERE code = $1`, [moduleCode]
    );
    const moduleRow = moduleResult.rows[0];
    if (!moduleRow) throw new AppError(MODULE_ERRORS.MODULE_NOT_FOUND);

    const roleCheck = await pool.query(
        `SELECT 1 FROM module_roles WHERE module_role_id = $1 AND module_id = $2`,
        [moduleRoleId, moduleRow.module_id]
    );
    if (roleCheck.rowCount === 0) throw new AppError(PROJECT_MEMBER_ERRORS.INVALID_MODULE_ROLE);

    await pool.query(
        `INSERT INTO project_member_module_roles (project_member_id, module_id, module_role_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (project_member_id, module_id) DO UPDATE SET module_role_id = EXCLUDED.module_role_id`,
        [memberId, moduleRow.module_id, moduleRoleId]
    );
};

// DELETE /:projectId/members/:userId — solo owner/admin.
export const removeProjectMemberService = async (
    { user_id : actingUserId } : DecodedToken, { projectId, userId : memberUserId } : ProjectMemberUserParam
) : Promise<void> => {

    await assertProjectAdmin(projectId, actingUserId);

    const result = await pool.query(
        `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
        [projectId, memberUserId]
    );
    if (result.rowCount === 0) throw new AppError(PROJECT_MEMBER_ERRORS.NOT_FOUND);
};
