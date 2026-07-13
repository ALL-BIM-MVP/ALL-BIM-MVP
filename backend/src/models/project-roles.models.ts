import type { ProjectRoleData } from "../schemas/project-roles.schema.js";

export interface ProjectRoleRow extends ProjectRoleData {
    project_role_id: number;
    is_default: boolean;
    created_by: number | null;
};

export interface ProjectRoleFull extends ProjectRoleRow {
    count: number;
};
