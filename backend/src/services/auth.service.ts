import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from "../db/database.js";
import type { Tokens, AuthPayload, ValidateResponse, AuthResponse, InvitationResponse } from '../models/auth.models.js';
import { generateAccessToken, generateRefreshToken, getRefreshTokenExpiresAt, verifyRefreshToken } from '../utils/jwt.js';
import type { InvitationRequest, LoginRequest, RegisterRequest } from '../schemas/auth.schema.js';
import { sendInvitation } from '../utils/resend.js';
import { AppError, ERRORS } from '../models/error.models.js';
import type { UserLayout } from '../models/users.models.js';
import { createSession } from './session.service.js';
import { hashToken } from '../utils/hashing.js';

export const loginService = async ({email, password} : LoginRequest) : Promise<AuthResponse> => {
    const result = await pool.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
    );
    
    const user = result.rows[0];
    if (!user) throw new AppError(ERRORS.LOGIN_FAILED);

    const storedHash = user.password_hash;
    const isValid : boolean = await bcrypt.compare(password, storedHash);
    if (!isValid) throw new AppError(ERRORS.LOGIN_FAILED);

    const payload : AuthPayload = {
        role_id: user.role_id,
        user_id: user.user_id,
        email: user.email
    };
    const tokens = await createSession(payload);

    return {
        ...tokens,
        rol_id: user.role_id,
        user: {
            id: user.user_id,
            name: user.name,
            correo: user.email,  
        }
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

    if (!dbToken) {
        throw new AppError(ERRORS.TOKEN_REFRESH_INVALID);
    }

    if (!dbToken.active) {
        throw new AppError(ERRORS.TOKEN_REFRESH_INVALID);
    }

    if (new Date(dbToken.expires_at) < new Date()) {
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

