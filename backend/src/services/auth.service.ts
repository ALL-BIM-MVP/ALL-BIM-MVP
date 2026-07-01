import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from "../db/database.js";
import type { Tokens, AuthPayload, ValidateResponse } from '../models/auth.models.js';
import { generateAccessToken, generateRefreshToken, getRefreshTokenExpiresAt, verifyRefreshToken } from '../utils/jwt.js';
import type { User } from '../models/users.models.js';
import type { InvitationRequest, LoginRequest, RegisterRequest } from '../schemas/auth.schema.js';
import { sendInvitation } from '../config/resend.js';
import { AppError, ERRORS } from '../models/error.models.js';
import type { UserLayout } from '../models/users.models.js';

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

    const access_token = generateAccessToken(payload);
    const refresh_token = generateRefreshToken(payload);

    const tokenHash = crypto.createHash("sha256").update(refresh_token).digest("hex");
    const expiresAt = getRefreshTokenExpiresAt();

    await pool.query(
        `INSERT INTO refresh_tokens (token_hash, created_at, expires_at, user_id) 
        VALUES ($1, NOW(), $2, $3)`,
        [tokenHash, expiresAt, user.user_id]
    );

    return { access_token, refresh_token };
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

export const refreshSessionService = async (refreshToken: string) : Promise<Tokens> => {
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
        throw new AppError(ERRORS.TOKEN_REFRESH_INVALID);
    }
    
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    
    const tokenQuery = await pool.query(
        `SELECT refresh_token_id, active, expires_at FROM refresh_tokens 
            WHERE token_hash = $1 AND user_id = $2 LIMIT 1`,
        [tokenHash, decoded.user_id]
    );

    const dbToken = tokenQuery.rows[0];

    if (!dbToken || !dbToken.active || new Date(dbToken.expires_at) < new Date()) {
        throw new AppError(ERRORS.TOKEN_REFRESH_EXPIRED);
    }

    await pool.query(
        `UPDATE refresh_tokens SET active = false WHERE refresh_token_id = $1`,
        [dbToken.refresh_token_id]
    );

    const userQuery = await pool.query<AuthPayload>(
        `SELECT user_id, role_id, email FROM users WHERE user_id = $1 AND active = true`,
        [decoded.user_id]
    );
    const user = userQuery.rows[0];
    if (!user) throw new AppError(ERRORS.AUTH_IDENTITY_UNKNOWN);

    const payload: AuthPayload = {
        user_id: user.user_id,
        role_id: user.role_id,
        email: user.email
    };

    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);
    const newTokenHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");
    const newExpiresAt = getRefreshTokenExpiresAt();

    await pool.query(
        `INSERT INTO refresh_tokens (token_hash, created_at, expires_at, user_id) 
            VALUES ($1, NOW(), $2, $3)`,
        [newTokenHash, newExpiresAt, user.user_id]
    );

    return { access_token: newAccessToken, refresh_token: newRefreshToken };
};

export const logoutService = async (refreshToken: string): Promise<void> => {
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    await pool.query(
        `UPDATE refresh_tokens 
            SET active = false WHERE token_hash = $1`,
        [tokenHash]
    );
};

export const getMeService = async (userId : number) : Promise<UserLayout> => {
    const result = await pool.query<UserLayout>(
        `SELECT u.user_id, r.name AS role_name, u.name, u.email, u.created_at 
            FROM users AS u 
            INNER JOIN roles AS r USING(role_id) 
            WHERE u.user_id = $1 LIMIT 1`,
        [userId]
    );

    const userInfo : UserLayout | undefined = result.rows[0];

    if (!userInfo) {
        throw new AppError(ERRORS.AUTH_IDENTITY_UNKNOWN);
    }

    return userInfo;
}