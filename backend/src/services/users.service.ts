import pool from "../db/database.js";
import bcrypt from 'bcrypt'
import { AppError, ERRORS } from "../models/error.models.js";
import type { UserLayout, UserResponse } from "../models/users.models.js";
import type { RegisterRequest } from "../schemas/auth.schema.js";
import type { GetUsersQuery } from "../schemas/users.schema.js";
import { hashToken } from "../utils/hashing.js";
import type { AuthPayload, AuthResponse } from "../models/auth.models.js";
import { createSession } from "./session.service.js";
import { ROLES } from "../constants/roles.js";
import type { PoolClient } from "pg";

export const registerService = async ({name, password, token} : RegisterRequest) : Promise< AuthResponse >=> {

    const client : PoolClient = await pool.connect();
    try {
        await client.query("BEGIN");

        const tokenHashed = hashToken(token);
        const invitationQuery = await client.query(
            `SELECT role_id, email FROM user_invitations  
                WHERE token_hash = $1 AND expires_at > NOW() AND used = false
                LIMIT 1 `,
            [tokenHashed]
        );

        if (invitationQuery.rowCount === 0) throw new AppError(ERRORS.INVALID_INVITATION);
        const { role_id, email } = invitationQuery.rows[0];

        const userQuery = await client.query(
            `SELECT 1 FROM users WHERE email = $1`,
            [email]
        );

        if (userQuery.rowCount !== 0) throw new AppError(ERRORS.USER_EXISTS);

        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await client.query(
            `INSERT INTO users(name, email, password_hash, role_id)
                VALUES ($1, $2, $3, $4)
                RETURNING *`,
            [name, email, passwordHash, role_id]
        );
        const user = newUser.rows[0];

        await client.query(
            `UPDATE user_invitations SET used = true WHERE token_hash = $1`,
            [tokenHashed]
        );

        const payload : AuthPayload = {
            role_id: user.role_id,
            user_id: user.user_id,
            email: user.email
        };
        const tokens = await createSession(payload, client);
        await client.query("COMMIT");
        return {
            ...tokens,
            rol_id: user.role_id,
            user: {
                id: user.user_id,
                name: user.name,
                correo: user.email,  
            }
        }
    } catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof AppError) throw error;
        
        throw new AppError(ERRORS.INTERNAL_SERVER_ERROR);
    } finally {
        client.release();
    } 
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


export const getAllUsersService = async ( {sort, active, order} : GetUsersQuery) : Promise<UserResponse[]> => {

    const queryParams: any[] = [ROLES.ADMINISTRADOR];
    let activeFilter = "";
    if (active !== undefined) {
        queryParams.push(active); 
        activeFilter = `AND u.active = $${queryParams.length}`;
    
    }

    const usersQuery = await pool.query<UserResponse>(
        `SELECT u.user_id, r.role_id, r.name AS role_name, u.name, u.email, u.active, u.created_at 
            FROM users AS u 
            INNER JOIN roles AS r USING(role_id) 
            WHERE r.role_id != $1 ${activeFilter} 
            ORDER BY u.${sort} ${order}`,
        queryParams
    );

    return usersQuery.rows;
};