import pool from "../db/database.js"
import type { Role } from "../models/roles.models.js";


export const getAllRolesService = async () : Promise<Role[]> => {
    const rolesQuery = await pool.query<Role>(
        `SELECT role_id, name FROM roles 
        WHERE is_assignable = true`
    );
    return rolesQuery.rows;
};