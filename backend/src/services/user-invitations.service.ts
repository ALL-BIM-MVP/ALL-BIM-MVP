import { sendInvitation } from "../utils/resend.js";
import pool from "../db/database.js";
import type { InvitationResponse, ValidateResponse } from "../models/auth.models.js";
import type { InvitationRequest } from "../schemas/auth.schema.js";
import { generateRandomToken, hashToken } from "../utils/hashing.js";
import { USER_ERRORS } from "../models/errors/user.errors.js";
import { ROLE_ERRORS } from "../models/errors/role.errors.js";
import { INVITATION_ERRRORS } from "../models/errors/invitation.errors.js";
import { AppError } from "../models/errors/app-error.js";

export const createInvitationService = async ({role_id, email} : InvitationRequest) : Promise<InvitationResponse> => {

    const userData = await pool.query(
        `SELECT 1 FROM users WHERE email = $1`,
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