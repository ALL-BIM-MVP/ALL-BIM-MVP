import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { GetProjectsQuery, ProjectCreate, ProjectIdParam, ProjectUpdate } from "../schemas/projects.schema.js";
import { AppError } from "../models/error.models.js";
import { buildProjectScopeFilter } from "../repositories/projects.repository.js";
import { transformProjectFull, type ProjectFull, type ProjectRow } from "../models/projects.models.js";
import { PROJECT_ERRORS } from "../models/errors/project.errors.js";
import { parseArgs } from "node:util";
import type { SrvRecord } from "node:dns";

export const getListProjectService = async ( 
    { user_id : userId, role_id : roleId } : DecodedToken, { scope } : GetProjectsQuery
) : Promise< ProjectFull[] > => {

    const { where, params } = buildProjectScopeFilter(scope, userId, roleId)

    const result = await pool.query<ProjectRow>(
        `SELECT
            p.project_id, p.name, p.description, p.location, p.start_date, p.end_date, p.created_at,
            u.user_id, u.name AS user_name, u.role_id
        FROM projects p
        INNER JOIN users u
            ON u.user_id = p.created_by
        ${where}
        ORDER BY p.created_at DESC`,
        params
    );

    return result.rows.map((p) => transformProjectFull(p));
};

export const getProjectByIdService = async ( 
    {user_id : userId } : DecodedToken , { projectId } : ProjectIdParam
) : Promise< ProjectFull > => {

    const result = await pool.query<ProjectRow>(
        `SELECT
            p.project_id, p.name, p.description, p.location, p.start_date, p.end_date, p.created_at,
            u.user_id, u.name AS user_name, u.role_id
        FROM projects p
        INNER JOIN users u
            ON u.user_id = p.created_by
        WHERE p.project_id = $2 AND (
                p.created_by = $1 
                OR EXISTS (        
                    SELECT 1 FROM project_members pm 
                    WHERE pm.project_id = p.project_id AND pm.user_id = $1 
                )
        ) LIMIT 1`,
        [userId, projectId]
    );

    const p = result.rows[0] ;

    if (!p) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);

    return transformProjectFull(p);
};

export const createProjectService = async ( 
    {user_id : userId } : DecodedToken, data : ProjectCreate
) : Promise<ProjectFull> => {

    const result = await pool.query<ProjectRow>(
        `INSERT INTO 
            projects(name, description, location, start_date, end_date, created_by)
        VALUES
            ($1, $2, $3, $4, $5, $6)
        RETURNING 
            project_id, name, description, location, start_date, end_date, created_at,
            created_by AS user_id,
            (SELECT name FROM users WHERE user_id = created_by) AS user_name,
            (SELECT role_id FROM users WHERE user_id = created_by) AS role_id`,
        [data.name, data.description, data.location, data.start_date, data.end_date, userId]
    );

    const p = result.rows[0] ;

    if (!p) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);

    return transformProjectFull(p);
};

export const updateProjectService = async(
    {user_id : userId } : DecodedToken, { projectId } : ProjectIdParam, data : ProjectUpdate
) : Promise<ProjectFull> => {

    const dataFiltered  = Object.entries(data)
        .filter( ([key, value]) => value !== undefined);
    console.log(dataFiltered)

    if (dataFiltered.length === 0) throw new AppError(PROJECT_ERRORS.NO_FIELDS_TO_UPDATE); 

    const querySet = dataFiltered
        .map( ([key, _], i) => `${key} = $${i + 1}`)
        .join(",");

    const params = dataFiltered
        .map( ([_, value]) => value);

    const lengthParams = params.length;

    const result = await pool.query<ProjectRow>(
        `UPDATE projects
        SET ${querySet}
        WHERE project_id = $${lengthParams + 1} AND created_by = $${lengthParams + 2} 
        RETURNING 
            project_id, name, description, location, start_date, end_date, created_at,
            created_by AS user_id,
            (SELECT name FROM users WHERE user_id = created_by) AS user_name,
            (SELECT role_id FROM users WHERE user_id = created_by) AS role_id`,
        [...params, projectId, userId]
    );

    const p = result.rows[0] ;

    if (!p) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);

    return transformProjectFull(p);
};

export const deleteProjectByIdService = async(
    {user_id : userId } : DecodedToken, { projectId } : ProjectIdParam
) : Promise<void> => {

    const result = await pool.query<ProjectRow>(
        `DELETE FROM projects
            WHERE project_id = $1 AND created_by = $2`,
        [projectId, userId]
    );

    if (result.rowCount === 0) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);
};
