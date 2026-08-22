import fs from "node:fs";
import path from "node:path";
import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { GetProjectsQuery, ProjectCreate, ProjectIdParam, ProjectUpdate } from "../schemas/projects.schema.js";
import { buildProjectScopeFilter } from "../repositories/projects.repository.js";
import { transformProjectFull, type ProjectFull, type ProjectRow } from "../models/projects.models.js";
import { PROJECT_ERRORS } from "../models/errors/project.errors.js";
import { AppError } from "../models/errors/app-error.js";
import { UPLOADS_DIR } from "../middlewares/upload.midleware.js";
import type { UserSuggestion } from "../models/users.models.js";
import type { SearchUserQuery } from "../schemas/project-invitations.schema.js";

export const getListProjectService = async ( 
    { user_id : userId, role_id : roleId } : DecodedToken, { scope } : GetProjectsQuery
) : Promise< ProjectFull[] > => {

    const { where, params } = buildProjectScopeFilter(scope, userId, roleId)

    const result = await pool.query<ProjectRow>(
        `SELECT
            p.project_id, p.name, p.description, p.location, p.client, p.contractor,
            p.start_date, p.end_date, p.created_at,
            u.user_id, u.name AS user_name, u.last_name AS user_last_name, u.role_id,
            f.file_id AS image_file_id, f.file_path AS image_path,
            f.name AS image_name, f.mime_type AS image_mime_type
        FROM projects p
        INNER JOIN users u
            ON u.user_id = p.owner_id
        LEFT JOIN project_images pi
            ON pi.project_id = p.project_id AND pi.image_type = 'cover'
        LEFT JOIN files f
            ON f.file_id = pi.file_id
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
            p.project_id, p.name, p.description, p.location, p.client, p.contractor,
            p.start_date, p.end_date, p.created_at,
            u.user_id, u.name AS user_name, u.last_name AS user_last_name, u.role_id,
            f.file_id AS image_file_id, f.file_path AS image_path,
            f.name AS image_name, f.mime_type AS image_mime_type
        FROM projects p
        INNER JOIN users u
            ON u.user_id = p.owner_id
        LEFT JOIN project_images pi
            ON pi.project_id = p.project_id AND pi.image_type = 'cover'
        LEFT JOIN files f
            ON f.file_id = pi.file_id
        WHERE p.project_id = $1 AND (
                p.owner_id = $2 
                OR EXISTS (        
                    SELECT 1 FROM project_members pm 
                    WHERE pm.project_id = p.project_id AND pm.user_id = $2 
                )
        ) LIMIT 1`,
        [projectId, userId ]
    );

    const p = result.rows[0] ;

    if (!p) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);

    return transformProjectFull(p);
};

export const createProjectService = async (
    {user_id : userId } : DecodedToken, data : ProjectCreate
) : Promise<ProjectFull> => {

    const client = await pool.connect();
    let p: ProjectRow | undefined;
    try {
        await client.query("BEGIN");

        const result = await client.query<ProjectRow>(
            `INSERT INTO
                projects(name, description, location, client, contractor, start_date, end_date, created_by, owner_id)
            VALUES
                ($1, $2, $3, $4, $5, $6, $7, $8, $8)
            RETURNING
                project_id, name, description, location, client, contractor, start_date, end_date, created_at,
                owner_id AS user_id,
                (SELECT name FROM users WHERE user_id = owner_id) AS user_name,
                (SELECT last_name FROM users WHERE user_id = owner_id) AS user_last_name,
                (SELECT role_id FROM users WHERE user_id = owner_id) AS role_id`,
            [data.name, data.description, data.location, data.client, data.contractor, data.start_date, data.end_date, userId]
        );
        p = result.rows[0];

        if (!p) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);

        // Fase 4 (clasificación manual, ver docs/roadmap-modulos-y-permisos.md)
        // — la config de clasificación queda anclada al alta del
        // proyecto, mode='norma' explícito (no un default implícito
        // resuelto en código cuando falta la fila) — así es un recurso
        // real desde el día uno, con updated_by de quién creó el
        // proyecto, no una ausencia que hay que interpretar.
        await client.query(
            `INSERT INTO ifc_classification_configs (project_id, mode, updated_by)
            VALUES ($1, 'norma', $2)`,
            [p.project_id, userId]
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    return transformProjectFull(p!);
};

export const updateProjectService = async(
    {user_id : userId } : DecodedToken, { projectId } : ProjectIdParam, data : ProjectUpdate
) : Promise<ProjectFull> => {

    const dataFiltered  = Object.entries(data)
        .filter( ([key, value]) => value !== undefined);

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
        WHERE project_id = $${lengthParams + 1} AND owner_id = $${lengthParams + 2}
        RETURNING
            project_id, name, description, location, client, contractor, start_date, end_date, created_at,
            owner_id AS user_id,
            (SELECT name FROM users WHERE user_id = owner_id) AS user_name,
            (SELECT last_name FROM users WHERE user_id = owner_id) AS user_last_name,
            (SELECT role_id FROM users WHERE user_id = owner_id) AS role_id`,
        [...params, projectId, userId]
    );

    const p = result.rows[0] ;

    if (!p) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);

    return transformProjectFull(p);
};

export const deleteProjectByIdService = async(
    {user_id : userId } : DecodedToken, { projectId } : ProjectIdParam
) : Promise<void> => {

    const result = await pool.query(
        `DELETE FROM projects
            WHERE project_id = $1 AND owner_id = $2`,
        [projectId, userId]
    );

    if (result.rowCount === 0) throw new AppError(PROJECT_ERRORS.PROJECT_NOT_FOUND);

    // El DELETE de arriba ya se llevó puestas todas las filas relacionadas
    // en la BD vía ON DELETE CASCADE (files, ifc_files, ifc_documents
    // (Fase 3) y todo lo de metrados colgado de ahí, project_images,
    // project_members, project_invitations) — pero eso no borra los BYTES reales del
    // disco, ninguna de esas cascadas toca el filesystem. Todo archivo
    // de este proyecto (subidas normales Y la imagen de portada) vive
    // bajo uploads/<projectId>/ porque así arma la ruta multer en
    // upload.midleware.ts, así que borrar esa carpeta entera de una
    // cubre todo sin tener que enumerar cada file_path a mano.
    await fs.promises.rm(path.join(UPLOADS_DIR, String(projectId)), { recursive: true, force: true });
};
