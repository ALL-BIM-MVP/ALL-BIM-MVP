import fs from "node:fs";
import path from "node:path";
import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { GetProjectsQuery, ProjectCreate, ProjectIdParam, ProjectUpdate } from "../schemas/projects.schema.js";
import { buildProjectScopeFilter } from "../repositories/projects.repository.js";
import {
    transformProjectFull, type FileTypeSummary, type ProjectDetail, type ProjectFull, type ProjectRow,
    type SpecialtySummary,
} from "../models/projects.models.js";
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
) : Promise< ProjectDetail > => {

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

    // Resumen de especialidades — cuenta DOCUMENTOS (ifc_documents),
    // no versiones (ver ProjectDetail en projects.models.ts). INNER
    // JOIN a propósito: documentos sin specialty_id (nullable en el
    // schema, aunque el upload de uno nuevo lo exige salvo que sea un
    // reemplazo de versión) simplemente no suman a ninguna fila —
    // "mantenerlo simple" significa no inventar un bucket "sin
    // especialidad" que nadie pidió todavía.
    const specialtiesResult = await pool.query<SpecialtySummary>(
        `SELECT s.code AS specialty_code, s.name AS specialty_name, COUNT(*)::int AS count
        FROM ifc_documents d
        INNER JOIN ifc_specialties s ON s.ifc_specialty_id = d.specialty_id
        WHERE d.project_id = $1
        GROUP BY s.ifc_specialty_id, s.code, s.name
        ORDER BY count DESC, s.name`,
        [projectId]
    );

    // Resumen de archivos por tipo — 'ifc' sale de ifc_documents (por
    // lo mismo de arriba: documentos, no versiones), el resto es
    // conteo directo de `files` (excluyendo la portada del proyecto,
    // que no es "un archivo subido" para este resumen, y 'fragments' —
    // migración del visor a ThatOpen — que es puramente técnico, no
    // algo que el usuario subió/generó a propósito, ver
    // getProjectFilesService en files.service.ts para el mismo
    // criterio aplicado al listado).
    const ifcCountResult = await pool.query<{ count : number }>(
        `SELECT COUNT(*)::int AS count FROM ifc_documents WHERE project_id = $1`,
        [projectId]
    );
    const otherTypesResult = await pool.query<FileTypeSummary>(
        `SELECT f.file_type, COUNT(*)::int AS count
        FROM files f
        WHERE f.project_id = $1 AND f.file_type NOT IN ('ifc', 'fragments')
            AND NOT EXISTS (SELECT 1 FROM project_images pi WHERE pi.file_id = f.file_id)
        GROUP BY f.file_type`,
        [projectId]
    );
    const ifcCount = ifcCountResult.rows[0]?.count ?? 0;
    const filesSummary: FileTypeSummary[] = [
        ...(ifcCount > 0 ? [{ file_type: "ifc", count: ifcCount }] : []),
        ...otherTypesResult.rows,
    ].sort((a, b) => b.count - a.count);

    return {
        ...transformProjectFull(p),
        specialties_summary: specialtiesResult.rows,
        files_summary: filesSummary,
    };
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

        // "Elemento conjunto" (estado de cantidad de elementos, ver
        // elemento-conjunto.service.ts) — mismo criterio que la config de
        // clasificación de arriba: anclado desde el alta, con el default
        // de siempre (los 4 campos builtin, en orden) explícito en filas
        // reales, no un default implícito resuelto en código.
        await client.query(
            `INSERT INTO elemento_conjunto_configs (project_id, updated_by) VALUES ($1, $2)`,
            [p.project_id, userId]
        );
        await client.query(
            `INSERT INTO elemento_conjunto_config_fields (project_id, position, field_type, builtin_field)
            VALUES ($1, 1, 'builtin', 'file_name'),
                   ($1, 2, 'builtin', 'global_id'),
                   ($1, 3, 'builtin', 'tag'),
                   ($1, 4, 'builtin', 'partida_code')`,
            [p.project_id]
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
