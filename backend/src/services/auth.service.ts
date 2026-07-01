import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from "../db/database.js";
import type { Tokens, AuthPayload, ValidateResponse } from '../models/auth.models.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import type { User } from '../models/users.models.js';
import type { InvitationRequest, LoginRequest, RegisterRequest } from '../schemas/auth.schema.js';
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
        role_id: user.role_id,
        user_id: user.user_id,
        email: user.email
    };

    return {
        access_token: generateAccessToken(payload),
        refresh_token: generateRefreshToken(payload),
    };
};

export const invitationService = async ({role_id, email} : InvitationRequest) : Promise<void> => {

    const userData = await pool.query(
        `SELECT 1 FROM users WHERE email = $1`,
        [email]
    );

    if (userData.rowCount !== 0) throw new AppError(ERRORS.USER_EXISTS);

    const roleCorrect = await pool.query(
        `SELECT 1 FROM roles WHERE role_id = $1`,
        [role_id]
    );

    if (roleCorrect.rowCount === 0) throw new AppError(ERRORS.INVALID_ROLE);

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
            WHERE i.token_hash = $1  AND i.expires_at > NOW() AND i.used = false
            LIMIT 1`,
        [tokenHash]
    );

    const validateData : ValidateResponse | undefined = resultQuery.rows[0];
    if (!validateData) throw new AppError(ERRORS.INVALID_INVITATION);

    return validateData;
};

export const registerService = async ({name, email, password, token} : RegisterRequest) => {

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const tokenHashed = crypto.createHash("sha256").update(token).digest("hex");
        const invitationQuery = await client.query(
            `SELECT role_id FROM invitations  
                WHERE token_hash = $1 AND email = $2 AND expires_at > NOW() AND used = false`,
            [tokenHashed, email]
        );
        console.log(invitationQuery)
        if (invitationQuery.rowCount === 0) throw new AppError(ERRORS.INVALID_INVITATION);
        const role_id = invitationQuery.rows[0].role_id;

        const userQuery = await client.query(
            `SELECT 1 FROM users WHERE email = $1`,
            [email]
        );

        if (userQuery.rowCount !== 0) throw new AppError(ERRORS.USER_EXISTS);

        const passwordHash = await bcrypt.hash(password, 10);
        await client.query(
            `INSERT INTO users(name, email, password_hash, role_id)
                VALUES ($1, $2, $3, $4)`,
            [name, email, passwordHash, role_id]
        );

        await client.query(
            `UPDATE invitations SET used = true WHERE token_hash = $1`,
            [tokenHashed]
        );

        await client.query("COMMIT");
    } catch (error) {
        if (error instanceof AppError) throw error;
        
        throw new AppError(ERRORS.INTERNAL_SERVER_ERROR);
    } finally {
        client.release();
    } 
  
};