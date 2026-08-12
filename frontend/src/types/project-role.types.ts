export interface ProjectRole {
    project_role_id: number;
    name: string;
    is_default: boolean;
    created_by: number | null;
    count: number;
}

export interface CreateProjectRoleRequest {
    name: string;
}

export interface UpdateProjectRoleRequest {
    name: string;
}