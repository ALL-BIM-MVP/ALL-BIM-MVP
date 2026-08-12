export interface Invitation {
    invitation_id: number;
    email: string;
    status: 'pendiente' | 'aceptado' | 'rechazado' | 'cancelado' | 'expirado';
    responded_at: string | null;
    created_at: string;
    expires_at: string;
    project_id: number;
    project_role: {
        project_role_id: number;
        project_role_name: string;
    };
    host: {
        user_id: number;
        user_name: string;
        user_email: string;
    };
}

export interface UserSearchResult {
    user_id: number;
    name: string;
    email: string;
}

export interface CreateInvitationRequest {
    email: string;
    project_role_id: number;
}

export interface UpdateInvitationRequest {
    status: 'aceptado' | 'rechazado' | 'cancelado';
}

export interface ProjectMember {
    user_id: number;
    user_name: string;
    user_email: string;
    role_id: number;
    role_name: string;
    joined_at: string;
}