import { ROLES } from "../constants/roles.js";
import { AppError } from "../models/error.models.js";
import { PERMISSION_ERRORS } from "../models/errors/permission.errors.js";
import type { GetProjectsQuery } from "../schemas/projects.schema.js";

export const buildProjectScopeFilter = ( scope : GetProjectsQuery["scope"], userId: number, roleId: number ) => {

    switch(scope) {
        case "mine":
            return {
                where: `
                WHERE p.created_by = $1
                OR EXISTS (
                    SELECT 1
                    FROM project_members pm
                    WHERE pm.project_id = p.project_id
                    AND pm.user_id = $1
                )
                `,
                params: [userId]
            };

        case "owner":
            return {
                where: "WHERE p.created_by = $1",
                params: [userId]
            };

        case "member":
            return {
                where: `
                WHERE EXISTS (
                    SELECT 1
                    FROM project_members pm
                    WHERE pm.project_id = p.project_id
                    AND pm.user_id = $1
                )
                AND p.created_by != $1
                `,
                params: [userId]
            };

        case "all":
            if (roleId !== ROLES.ADMINISTRADOR) {
                throw new AppError(PERMISSION_ERRORS.ADMIN_PERMISSION_REQUIRED);
            }

            return {
                where: "",
                params: []
            };
    }
};