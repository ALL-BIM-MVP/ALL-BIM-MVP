import crypto from "crypto";
import pool from "../db/database.js";
import { generateAccessToken, generateRefreshToken, getRefreshTokenExpiresAt } from "../utils/jwt.js";
import type { AuthPayload, Tokens } from "../models/auth.models.js";
import { hashToken } from "../utils/hashing.js";
import type { Pool, PoolClient } from "pg";

export const createSession = async ( payload: AuthPayload, client?: PoolClient ): Promise<Tokens> => {

    const connection = client ?? await pool.connect();

    try {

        const access_token = generateAccessToken(payload);
        const refresh_token = generateRefreshToken(payload);

        await connection.query(
            `INSERT INTO refresh_tokens 
            (token_hash, created_at, expires_at, user_id)
            VALUES ($1,NOW(),$2,$3)`,
            [
                hashToken(refresh_token),
                getRefreshTokenExpiresAt(),
                payload.user_id
            ]
        );

        return {
            access_token,
            refresh_token
        };

    } finally {
        if (!client) {
            connection.release();
        }
    }
};