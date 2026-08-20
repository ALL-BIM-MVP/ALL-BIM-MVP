import pool from "../db/database.js";
import type { PoolClient } from "pg";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import {
    transformInvitationForUser, transformInvitationToInfoFull,
    type EssentialData, type ProjectInvitationForUser, type ProjectInvitationForUserRow,
    type ProjectInvitationFull, type ProjectInvitationRow,
} from "../models/project-invitations.models.js";
import type {
    InviteToProjectData, MeInvitationsQuery, ProjectInvitationParams,
    RespondToTheInvitation, SearchUserQuery, updateStatusData,
} from "../schemas/project-invitations.schema.js";
import { AppError } from "../models/errors/app-error.js";
import { PROJECT_INVITATION_ERRORS } from "../models/errors/project-invitations.errors.js";
import { MODULE_ERRORS } from "../models/errors/modules.errors.js";
import type { UserSuggestion } from "../models/users.models.js";
import { assertProjectAdmin } from "./project-access.service.js";

// JSON_AGG de project_invitation_module_roles, reusado en las 3
// queries que devuelven una invitación completa.
const MODULE_ROLES_SUBQUERY = `
    COALESCE(
        (SELECT JSON_AGG(
            JSON_BUILD_OBJECT(
                'module_code', m.code, 'module_name', m.name,
                'module_role_id', mr.module_role_id, 'role_name', mr.name
            )
        )
        FROM project_invitation_module_roles pimr
        INNER JOIN module_roles mr USING(module_role_id)
        INNER JOIN modules m ON m.module_id = pimr.module_id
        WHERE pimr.invitation_id = pi.invitation_id),
        '[]'
    ) AS module_roles`;

export const getListInvitationsOfProjectService= async (
    {user_id : userId} : DecodedToken, { projectId } : ProjectIdParam
) : Promise<ProjectInvitationFull[]> => {

    await assertProjectAdmin(projectId, userId);

    const result = await pool.query<ProjectInvitationRow>(
        `SELECT pi.invitation_id, pi.email, pi.responded_at, pi.created_at, pi.expires_at, pi.project_id,
            pi.is_admin,
            u.user_id AS host_id, u.name AS host_name, u.email AS host_email,
            ${MODULE_ROLES_SUBQUERY},
            CASE
                WHEN pi.status = 'pendiente'
                    AND pi.expires_at < NOW()
                THEN 'vencido'
                ELSE pi.status
            END AS status
        FROM project_invitations pi
        LEFT JOIN users u
            ON u.user_id = pi.invited_by
        WHERE pi.project_id = $1
        ORDER BY pi.created_at DESC`,
        [projectId]
    );

    return result.rows.map( pi => transformInvitationToInfoFull(pi));
};

export const createInvitationToProjectService = async (
    {user_id : ownerId} : DecodedToken, { projectId } : ProjectIdParam,
    { email, is_admin : isAdmin, module_roles : moduleRoles } : InviteToProjectData
) : Promise<ProjectInvitationFull> => {

    await assertProjectAdmin(projectId, ownerId);

    const validationResult = await pool.query(
        `SELECT 1 FROM projects p
        INNER JOIN users u
            ON u.user_id = p.owner_id
        WHERE p.project_id = $1 AND u.email != $2
            AND NOT EXISTS (
                SELECT 1 FROM project_members pm
                INNER JOIN users uu USING(user_id)
                WHERE pm.project_id = p.project_id AND uu.email = $2
            )
            AND NOT EXISTS (
                SELECT 1 FROM project_invitations pi
                WHERE pi.project_id = p.project_id
                    AND pi.email = $2
                    AND pi.status = 'pendiente'
                    AND pi.expires_at > NOW()
            )`,
        [projectId, email]
    );

    if (validationResult.rowCount === 0) throw new AppError(PROJECT_INVITATION_ERRORS.INVALID_INVITATION_REQUEST);

    const userResult = await pool.query<{user_id : number}>(
        `SELECT user_id FROM users WHERE email = $1`,
        [email]
    );
    const inviteeUserId = userResult.rows[0]?.user_id ?? null;

    if (!inviteeUserId) throw new AppError(PROJECT_INVITATION_ERRORS.USER_NOT_FOUND_IN_APP);

    // Valida cada (module_code, module_role_id) contra el catálogo real
    // ANTES de insertar nada — evita dejar una invitación a medio
    // armar si el frontend manda una combinación que no existe.
    const resolvedModuleRoles : Array<{ moduleId : number; moduleRoleId : number }> = [];
    for (const { module_code : moduleCode, module_role_id : moduleRoleId } of moduleRoles) {
        const moduleResult = await pool.query<{ module_id : number }>(
            `SELECT module_id FROM modules WHERE code = $1`, [moduleCode]
        );
        const moduleRow = moduleResult.rows[0];
        if (!moduleRow) throw new AppError(MODULE_ERRORS.MODULE_NOT_FOUND);

        const roleCheck = await pool.query(
            `SELECT 1 FROM module_roles WHERE module_role_id = $1 AND module_id = $2`,
            [moduleRoleId, moduleRow.module_id]
        );
        if (roleCheck.rowCount === 0) throw new AppError(MODULE_ERRORS.MODULE_ROLE_NOT_FOUND);

        resolvedModuleRoles.push({ moduleId: moduleRow.module_id, moduleRoleId });
    }

    const client : PoolClient = await pool.connect();
    let invitationId : number;
    try {
        await client.query("BEGIN");

        const resultCreate = await client.query<{invitation_id : number}>(
            `INSERT INTO
                project_invitations(email, project_id, is_admin, invited_by)
            VALUES ($1, $2, $3, $4)
            RETURNING invitation_id`,
            [email, projectId, isAdmin, ownerId]
        );
        invitationId = resultCreate.rows[0]!.invitation_id;

        for (const { moduleId, moduleRoleId } of resolvedModuleRoles) {
            await client.query(
                `INSERT INTO project_invitation_module_roles (invitation_id, module_id, module_role_id)
                VALUES ($1, $2, $3)`,
                [invitationId, moduleId, moduleRoleId]
            );
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }

    const resultInvitation = await pool.query<ProjectInvitationRow>(
        `SELECT pi.invitation_id, pi.email, pi.status, pi.responded_at, pi.created_at, pi.expires_at, pi.project_id,
            pi.is_admin,
            u.user_id AS host_id, u.name AS host_name, u.email AS host_email,
            ${MODULE_ROLES_SUBQUERY}
        FROM project_invitations pi
        LEFT JOIN users u
            ON u.user_id = pi.invited_by
        WHERE pi.invitation_id = $1
        LIMIT 1`,
        [invitationId]
    );

    const pi = resultInvitation.rows[0];

    if (!pi) throw new AppError(PROJECT_INVITATION_ERRORS.NOT_FOUND);

    return transformInvitationToInfoFull(pi);
};


export const updateStatusInvitationService= async (
    {user_id : userId} : DecodedToken, { projectId, invitationId } : ProjectInvitationParams,
    { status } : updateStatusData
) : Promise<ProjectInvitationFull> => {

    const currentData = await pool.query<EssentialData>(
        `SELECT pi.status, pi.email, pi.expires_at, pi.is_admin, p.owner_id
            FROM project_invitations pi
        INNER JOIN projects p USING(project_id)
            WHERE pi.invitation_id = $1 AND pi.project_id = $2`,
        [invitationId, projectId]
    );

    if (currentData.rowCount === 0) throw new AppError(PROJECT_INVITATION_ERRORS.NOT_FOUND);

    const { status: currentStatus, email: inviteeEmail, expires_at: expiresAt,
        is_admin: isAdmin, owner_id: projectOwnerId } = currentData.rows[0] as EssentialData;

    if (new Date(expiresAt) < new Date()) {
        throw new AppError(PROJECT_INVITATION_ERRORS.INVITATION_EXPIRED);
    }

    if (currentStatus !== 'pendiente') {
        throw new AppError(PROJECT_INVITATION_ERRORS.ALREADY_RESPONDED);
    }

    if (status === 'cancelado') {
        if (projectOwnerId !== userId) throw new AppError(PROJECT_INVITATION_ERRORS.UNAUTHORIZED);
    } else if (status === 'aceptado' || status === 'rechazado'){
        const verifyUser = await pool.query(
            `SELECT 1 FROM users WHERE user_id = $1 AND email = $2`,
            [userId, inviteeEmail]
        );
        if (verifyUser.rowCount === 0) throw new AppError(PROJECT_INVITATION_ERRORS.UNAUTHORIZED);
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const resultUpdate = await client.query<{ invitation_id: number }>(
            `UPDATE project_invitations
             SET status = $1, responded_at = NOW()
             WHERE invitation_id = $2
             RETURNING invitation_id`,
            [status, invitationId]
        );

        if (resultUpdate.rowCount === 0) throw new AppError(PROJECT_INVITATION_ERRORS.NOT_FOUND);

        if (status === 'aceptado') {
            const memberResult = await client.query<{ project_member_id : number }>(
                `INSERT INTO project_members(project_id, user_id, is_admin)
                 VALUES ($1, $2, $3)
                 RETURNING project_member_id`,
                [projectId, userId, isAdmin]
            );
            const projectMemberId = memberResult.rows[0]!.project_member_id;

            // Copia 1:1 project_invitation_module_roles ->
            // project_member_module_roles (vacío si is_admin=true, ya
            // que ahí no se insertó ninguna al crear la invitación).
            await client.query(
                `INSERT INTO project_member_module_roles (project_member_id, module_id, module_role_id)
                SELECT $1, module_id, module_role_id
                FROM project_invitation_module_roles
                WHERE invitation_id = $2`,
                [projectMemberId, invitationId]
            );
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    const resultInvitation = await pool.query<ProjectInvitationRow>(
        `SELECT pi.invitation_id, pi.email, pi.status, pi.responded_at, pi.created_at, pi.expires_at, pi.project_id,
            pi.is_admin,
            u.user_id AS host_id, u.name AS host_name, u.email AS host_email,
            ${MODULE_ROLES_SUBQUERY}
        FROM project_invitations pi
        LEFT JOIN users u
            ON u.user_id = pi.invited_by
        WHERE pi.invitation_id = $1
        LIMIT 1`,
        [invitationId]
    );

    const pi = resultInvitation.rows[0];

    if (!pi) throw new AppError(PROJECT_INVITATION_ERRORS.NOT_FOUND);

    return transformInvitationToInfoFull(pi);
};


export const getMeInvitationsToProjectsService = async (
    { email } : DecodedToken, { filter } : MeInvitationsQuery
) : Promise<ProjectInvitationForUser[]> => {

    let statusQuery = "";
    if (filter === 'all') {
        statusQuery = "pi.status != 'cancelado'";
    } else if (filter === 'pending') {
        statusQuery = "pi.status = 'pendiente' AND pi.expires_at > NOW()";
    } else if (filter === 'completed') {
        statusQuery = "(pi.status IN ('aceptado', 'rechazado') OR (pi.status = 'pendiente' AND pi.expires_at < NOW()))";
    }

    const result = await pool.query<ProjectInvitationForUserRow>(
        `SELECT pi.invitation_id, pi.responded_at, pi.created_at, pi.expires_at,
            pi.is_admin,
            p.project_id, p.name AS project_name,
            u.name AS host_name,
            ${MODULE_ROLES_SUBQUERY},
            CASE
                WHEN pi.status = 'pendiente'
                    AND pi.expires_at < NOW()
                THEN 'vencido'
                ELSE pi.status
            END AS status
        FROM project_invitations pi
        LEFT JOIN projects p
            USING(project_id)
        LEFT JOIN users u
            ON u.user_id = pi.invited_by
        WHERE pi.email = $1 AND
            ${statusQuery}
        ORDER BY
            CASE
                WHEN pi.status = 'pendiente' AND pi.expires_at > NOW() THEN 0
                ELSE 1
            END,
            pi.created_at DESC
        `,
        [email]
    );

    return result.rows.map( pi => transformInvitationForUser(pi));
};


export const getUsersSuggestionForInvitationToProjectService = async (
   {attribute, value} : SearchUserQuery, { projectId } : ProjectIdParam
): Promise<UserSuggestion[]> => {
    const searchQuery = `%${value.trim()}%`;

    const column = attribute === 'email' ? 'email' : 'name';

    const result = await pool.query<UserSuggestion>(
        `SELECT u.user_id, u.name, u.email
        FROM users u
        WHERE u.active = true
            AND (u.${column} ILIKE $1)
            AND NOT EXISTS (
                SELECT 1 FROM project_members pm
                WHERE pm.project_id = $2 AND pm.user_id = u.user_id
            )
            AND NOT EXISTS (
                SELECT 1 FROM project_invitations pi
                WHERE pi.project_id = $2
                    AND pi.email = u.email
                    AND pi.status = 'pendiente'
           )
        ORDER BY u.${column} ASC
        LIMIT 8`,
        [searchQuery, projectId]
    );

    return result.rows;
};
