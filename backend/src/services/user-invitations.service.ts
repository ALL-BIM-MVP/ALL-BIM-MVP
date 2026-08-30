import { sendInvitation } from "../utils/resend.js";
import pool from "../db/database.js";
import type { InvitationResponse, ValidateResponse } from "../models/auth.models.js";
import type { GetUserInvitationsQuery, InvitationRequest } from "../schemas/auth.schema.js";
import { generateRandomToken, hashToken } from "../utils/hashing.js";
import { USER_ERRORS } from "../models/errors/user.errors.js";
import { ROLE_ERRORS } from "../models/errors/role.errors.js";
import { INVITATION_ERRRORS } from "../models/errors/invitation.errors.js";
import { AppError } from "../models/errors/app-error.js";
import {
    transformUserInvitationToHistoryItem,
    type UserInvitationHistoryItem,
    type UserInvitationHistoryRow,
} from "../models/user-invitations.models.js";

export const createInvitationService = async ({role_id, email} : InvitationRequest) : Promise<InvitationResponse> => {

    // is_deleted = false a propósito: una cuenta eliminada no debe
    // bloquear el email para siempre — se puede volver a invitar, y al
    // aceptar (registerService) retoma esa misma fila en vez de
    // chocar con USER_ALREADY_EXISTS.
    const userData = await pool.query(
        `SELECT 1 FROM users WHERE email = $1 AND is_deleted = false`,
        [email]
    );

    if (userData.rowCount !== 0) throw new AppError(USER_ERRORS.USER_ALREADY_EXISTS);

    const roleCorrect = await pool.query(
        `SELECT name AS "rolName" FROM roles 
            WHERE role_id = $1 AND is_assignable = true LIMIT 1`,
        [role_id]
    );

    if (roleCorrect.rowCount === 0) throw new AppError(ROLE_ERRORS.ROLE_NOT_ASSIGNABLE);
    const { rolName } = roleCorrect.rows[0];

    const tokenRandom = generateRandomToken();
    const tokenHash = hashToken(tokenRandom);

    await pool.query(
        `INSERT INTO user_invitations(email, token_hash, role_id)
            VALUES ($1, $2, $3)`,
        [email, tokenHash, role_id]
    );    
    
    const inviteUrl = `${process.env.DOMAIN_FRONT}/register?token=${tokenRandom}`;
    
    await sendInvitation(email, inviteUrl, rolName);

    return {
        token : tokenRandom,
        link : inviteUrl
    };
};

export const validateInvitationService = async (queryToken : string) : Promise< ValidateResponse > => {
    const tokenHash  = hashToken(queryToken); 

    const resultQuery = await pool.query<ValidateResponse>(
        `SELECT r.role_id, r.name AS role_name, i.email FROM user_invitations AS i 
            INNER JOIN roles AS r USING(role_id)
            WHERE i.token_hash = $1  AND i.expires_at > NOW() AND i.used = false
            LIMIT 1`,
        [tokenHash]
    );

    const validateData : ValidateResponse | undefined = resultQuery.rows[0];
    if (!validateData) throw new AppError(INVITATION_ERRRORS.INVITATION_INVALID);

    return validateData;
};

// Techo server-side: aunque el cliente no mande ?limit, nunca se manda
// la tabla entera; y aunque pida un limit gigante, se lo recorta acá.
const DEFAULT_INVITATIONS_LIMIT = 50;
const MAX_INVITATIONS_LIMIT = 100;

export const getUserInvitationsHistoryService = async (
    { limit } : GetUserInvitationsQuery
) : Promise<UserInvitationHistoryItem[]> => {

    const appliedLimit = Math.min(limit ?? DEFAULT_INVITATIONS_LIMIT, MAX_INVITATIONS_LIMIT);

    const result = await pool.query<UserInvitationHistoryRow>(
        `SELECT
            i.invitation_id, i.email, i.created_at, i.expires_at, i.used,
            CASE
                WHEN i.used THEN 'usado'
                WHEN i.expires_at < NOW() THEN 'vencido'
                ELSE 'pendiente'
            END AS status,
            r.role_id, r.name AS role_name
        FROM user_invitations i
        INNER JOIN roles r USING(role_id)
        ORDER BY i.created_at DESC
        LIMIT $1`,
        [appliedLimit]
    );

    return result.rows.map(transformUserInvitationToHistoryItem);
};