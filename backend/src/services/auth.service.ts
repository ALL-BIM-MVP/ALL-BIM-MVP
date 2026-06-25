import bcrypt from 'bcrypt';
import pool from "../db/database.js";
import type { LoginData, Tokens, AuthPayload } from '../models/auth.models.js';
import { generateAccessToken, generateRefreshToken } from '../utils/jwt.js';
import type { User } from '../models/usuario.models.js';

export const loginService = async ({email, password} : LoginData) : Promise<Tokens | null> => {
    const result = await pool.query(
        `SELECT * FROM users WHERE email = $1`,
        [email]
    );

    const user: User | undefined = result.rows[0];
    if (!user) return null;

    const storedHash = user.password_hash;

    // COMPARACION DIRECTA MIENTRAS PRUEBAS
    const isValid = await bcrypt.compare(password, storedHash);

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


export const registerService = async () => {

}