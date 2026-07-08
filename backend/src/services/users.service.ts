import pool from "../db/database.js";
import type { UserResponse } from "../models/users.models.js";
import type { GetUsersQuery } from "../schemas/users.schema.js";


export const getAllUsersService = async ( {sort, active, order} : GetUsersQuery) : Promise<UserResponse[]> => {

    const queryParams: any[] = [];
    let activeFilter = "";
    if (active !== undefined) {
        queryParams.push(active); 
        activeFilter = `AND u.active = $${queryParams.length}`;
    }

    const usersQuery = await pool.query<UserResponse>(
        `SELECT u.user_id, r.role_id, r.name AS role_name, u.name, u.email, u.active, u.created_at 
            FROM users AS u 
            INNER JOIN roles AS r USING(role_id) 
            WHERE r.role_id != 1 ${activeFilter} 
            ORDER BY u.${sort} ${order}`,
        queryParams
    );

    return usersQuery.rows;
};