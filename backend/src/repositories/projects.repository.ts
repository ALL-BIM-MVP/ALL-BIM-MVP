import type { GetProjectsQuery } from "../schemas/projects.schema.js";

export const buildProjectScopeFilter = ( scope : GetProjectsQuery["scope"], userId: number ) => {

    switch(scope) {
        case "mine":
            return {
                where: `
                WHERE p.owner_id = $1
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
                where: "WHERE p.owner_id = $1",
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
                AND p.owner_id != $1
                `,
                params: [userId]
            };
    }
};