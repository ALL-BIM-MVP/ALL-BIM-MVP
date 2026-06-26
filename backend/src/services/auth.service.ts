import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from "../db/database.js";
import type { Tokens, AuthPayload, ValidateResponse } from '../models/auth.models.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import type { User } from '../models/usuario.models.js';
import type { InvitationRequest, LoginRequest } from '../schemas/auth.schema.js';
import { sendInvitation } from '../config/resend.js';
import { AppError, ERRORS } from '../models/error.models.js';

export const loginService = async ({email, password} : LoginRequest) : Promise<Tokens | null> => {
    const result = await pool.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
    );
    
    const user: User | undefined = result.rows[0];
    if (!user) return null;

    const storedHash = user.password_hash;
    const isValid : Boolean = await bcrypt.compare(password, storedHash);
    if (!isValid) return null;

    const payload : AuthPayload = {
        user_id: user.user_id,
        email: user.email
    };

    return {
        access_token: generateAccessToken(payload),
        refresh_token: generateRefreshToken(payload)
    };
};

export const invitationService = async ({role_id, email} : InvitationRequest) => {

    const userData = await pool.query(
        `SELECT 1 FROM users WHERE email = $1`,
        [email]
    );

    if (userData.rowCount !== 0) throw new AppError(ERRORS.USER_EXISTS, 409);

    const roleCorrect = await pool.query(
        `SELECT 1 FROM roles WHERE role_id = $1`,
        [role_id]
    );

    if (roleCorrect.rowCount === 0) throw new AppError(ERRORS.INVALID_ROLE, 400);

    const tokenRandom = crypto.randomUUID();
    const tokenHash = crypto.createHash("sha256").update(tokenRandom).digest("hex");

    await pool.query(
        `INSERT INTO invitations(email, token_hash, role_id)
            VALUES ($1, $2, $3)`,
        [email, tokenHash, role_id]
    );    
    
    const inviteUrl = `${process.env.DOMAIN_FRONT}/register?token=${tokenRandom}`;
    
    await sendInvitation(email, inviteUrl);
};

export const validateInvitationTokenService = async (queryToken : string) : Promise< ValidateResponse > => {
    const tokenHash  = crypto.createHash("sha256").update(queryToken).digest("hex"); 

    const resultQuery = await pool.query(
        `SELECT r.role_id, r.name AS role_name, i.email FROM invitations AS i 
            INNER JOIN roles AS r USING(role_id)
            WHERE i.token_hash = $1  AND i.expires_at > NOW() AND i.used = false`,
        [tokenHash]
    );

    const validateData : ValidateResponse | undefined = resultQuery.rows[0];
    if (!validateData) throw new AppError(ERRORS.INVALID_INVITATION, 404);

    return validateData;
};