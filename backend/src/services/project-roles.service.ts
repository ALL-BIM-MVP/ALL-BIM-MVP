import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectRoleData, ProjectRoleIdParam } from "../schemas/project-roles.schema.js";
import type { ProjectRoleFull, ProjectRoleRow } from "../models/project-roles.models.js";
import { PROJECT_ROLE_ERRORS } from "../models/errors/project-roles.errors.js";
import { AppError } from "../models/errors/app-error.js";

export const getListProjectRolesService = async (
    {user_id : userId} : DecodedToken
) : Promise<ProjectRoleFull[]> => {

    const result = await pool.query<ProjectRoleFull>(
        `SELECT
            pr.project_role_id, pr.name, pr.is_default, pr.created_by,
            COUNT(pm.project_member_id) FILTER (WHERE p.owner_id = $1)::int AS count
        FROM project_roles pr
        LEFT JOIN project_members pm
            USING(project_role_id)
        LEFT JOIN projects p
            USING(project_id)
        WHERE
            pr.is_default = true OR pr.created_by = $1
        GROUP BY
            pr.project_role_id, pr.name, pr.is_default, pr.created_by
        ORDER BY pr.is_default DESC, pr.name ASC`,
        [userId]
    );

    return result.rows;
};

export const createProjectRoleService = async (
    {user_id : userId } : DecodedToken, { name } : ProjectRoleData
) : Promise<ProjectRoleFull> => {

    const result = await pool.query<ProjectRoleRow>(
        `INSERT INTO project_roles(name, created_by)
            VALUES ($1, $2)
        RETURNING project_role_id, name, is_default, created_by`,
        [name, userId]
    );

    const pr = result.rows[0] ;

    if (!pr) throw new AppError(PROJECT_ROLE_ERRORS.PROJECT_ROLE_NOT_FOUND);
    return {
        ...pr,
        count : 0
    }
};

export const updateProjectRoleService = async (
    {user_id : userId} : DecodedToken, { name } : ProjectRoleData, {projectRoleId} :ProjectRoleIdParam
) : Promise<ProjectRoleFull> => {

    const result = await pool.query<ProjectRoleFull>(
        `UPDATE project_roles pr
            SET name = $1
            WHERE created_by = $2 AND project_role_id = $3 AND is_default = false
        RETURNING pr.project_role_id, pr.name, pr.is_default, pr.created_by, 
            (
                SELECT COUNT(pm.project_member_id) 
                    FROM project_members pm
                INNER JOIN projects p USING(project_id)
                    WHERE pm.project_role_id = pr.project_role_id
                    AND p.owner_id = $2
            )::int AS count;`,
        [name, userId, projectRoleId]
    );

    const pr = result.rows[0];

    if (!pr) throw new AppError(PROJECT_ROLE_ERRORS.PROJECT_ROLE_NOT_FOUND);
    
    return pr;
};

export const deleteProjectRoleService = async (
    {user_id : userId} : DecodedToken, {projectRoleId} :ProjectRoleIdParam
) : Promise<void> => {
    const checkRole = await pool.query(
        `SELECT is_default FROM project_roles 
            WHERE project_role_id = $1 AND created_by = $2 AND is_default = false`,
        [projectRoleId, userId]
    );
    if (checkRole.rowCount === 0) throw new AppError(PROJECT_ROLE_ERRORS.PROJECT_ROLE_NOT_FOUND);

    const checkUsage = await pool.query(
        `SELECT 1 FROM project_members pm
        INNER JOIN projects p USING(project_id)
            WHERE pm.project_role_id = $1 AND p.owner_id = $2 
        LIMIT 1`,
        [projectRoleId, userId]
    );
    if (checkUsage.rowCount !== 0) throw new AppError(PROJECT_ROLE_ERRORS.ROLE_IN_USE);

    await pool.query(
        `DELETE FROM project_roles WHERE project_role_id = $1`,
        [projectRoleId]
    );
    
};