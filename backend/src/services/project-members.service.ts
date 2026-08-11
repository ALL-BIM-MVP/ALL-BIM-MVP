import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import type { ProjectMemberIdParam, ProjectMemberUserParam, UpdateProjectMemberRoleData } from "../schemas/project-members.schema.js";
import { transformMemberToFull, type ProjectMemberFull, type ProjectMemberRow } from "../models/project-members.models.js";
import { AppError } from "../models/errors/app-error.js";
import { PROJECT_MEMBER_ERRORS } from "../models/errors/project-members.errors.js";

export const getListProjectMembersService = async (
    {user_id : ownerId} : DecodedToken, { projectId } : ProjectIdParam
) : Promise<ProjectMemberFull[]> => {

    const result = await pool.query<ProjectMemberRow>(
        `SELECT pm.project_member_id, pm.joined_at, pm.project_id,
            u.user_id, u.name AS user_name, u.email AS user_email,
            pr.project_role_id, pr.name AS project_role_name
        FROM project_members pm
        INNER JOIN projects p
            USING(project_id)
        INNER JOIN users u
            USING(user_id)
        INNER JOIN project_roles pr
            USING(project_role_id)
        WHERE pm.project_id = $1 AND p.owner_id = $2
        ORDER BY pm.joined_at DESC`,
        [projectId, ownerId]
    );

    return result.rows.map( pm => transformMemberToFull(pm));
};

export const updateProjectMemberRoleService = async (
    {user_id : ownerId} : DecodedToken, { projectId, memberId } : ProjectMemberIdParam,
    { project_role_id : projectRoleId } : UpdateProjectMemberRoleData
) : Promise<ProjectMemberFull> => {

    const roleCheck = await pool.query(
        `SELECT 1 FROM project_roles
            WHERE project_role_id = $1 AND (is_default = true OR created_by = $2)`,
        [projectRoleId, ownerId]
    );

    if (roleCheck.rowCount === 0) throw new AppError(PROJECT_MEMBER_ERRORS.INVALID_ROLE);

    const resultUpdate = await pool.query<{ project_member_id : number }>(
        `UPDATE project_members pm
            SET project_role_id = $1
        FROM projects p
        WHERE pm.project_member_id = $2
            AND pm.project_id = $3
            AND p.project_id = pm.project_id
            AND p.owner_id = $4
        RETURNING pm.project_member_id`,
        [projectRoleId, memberId, projectId, ownerId]
    );

    const updated = resultUpdate.rows[0];

    if (!updated) throw new AppError(PROJECT_MEMBER_ERRORS.NOT_FOUND);

    const resultMember = await pool.query<ProjectMemberRow>(
        `SELECT pm.project_member_id, pm.joined_at, pm.project_id,
            u.user_id, u.name AS user_name, u.email AS user_email,
            pr.project_role_id, pr.name AS project_role_name
        FROM project_members pm
        INNER JOIN users u
            USING(user_id)
        INNER JOIN project_roles pr
            USING(project_role_id)
        WHERE pm.project_member_id = $1
        LIMIT 1`,
        [updated.project_member_id]
    );

    const pm = resultMember.rows[0];

    if (!pm) throw new AppError(PROJECT_MEMBER_ERRORS.NOT_FOUND);

    return transformMemberToFull(pm);
};

export const removeProjectMemberService = async (
    {user_id : ownerId} : DecodedToken, { projectId, userId : memberUserId } : ProjectMemberUserParam
) : Promise<void> => {

    const result = await pool.query(
        `DELETE FROM project_members pm
        USING projects p
        WHERE pm.project_id = p.project_id
            AND pm.project_id = $1
            AND pm.user_id = $2
            AND p.owner_id = $3`,
        [projectId, memberUserId, ownerId]
    );

    if (result.rowCount === 0) throw new AppError(PROJECT_MEMBER_ERRORS.NOT_FOUND);
};
