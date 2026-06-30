import pool from "../db/database.js"
import type { Role } from "../models/roles.models.js";


export const getAllRolesService = async () : Promise<Role[]> => {

    const rolesQuery = await pool.query<Role>(
        `SELECT role_id, name FROM roles WHERE role_id != 1`
    );
    return rolesQuery.rows;
}  