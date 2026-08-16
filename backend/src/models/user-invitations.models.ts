// user_invitations no tiene columna "status" (a diferencia de
// project_invitations) — solo used/expires_at, así que el estado se
// deriva acá con el mismo criterio que ya usa
// project-invitations.service.ts para "vencido": pendiente Y ya pasó
// expires_at.
export type UserInvitationStatus = 'pendiente' | 'usado' | 'vencido';

interface RoleInfo {
    role_id: number;
    role_name: string;
}

export interface UserInvitationHistoryRow {
    invitation_id: number;
    email: string;
    created_at: Date;
    expires_at: Date;
    used: boolean;
    status: UserInvitationStatus;
    role_id: number;
    role_name: string;
}

export interface UserInvitationHistoryItem {
    invitation_id: number;
    email: string;
    created_at: Date;
    expires_at: Date;
    used: boolean;
    status: UserInvitationStatus;
    role: RoleInfo;
}

export const transformUserInvitationToHistoryItem = (
    row: UserInvitationHistoryRow
): UserInvitationHistoryItem => ({
    invitation_id: row.invitation_id,
    email: row.email,
    created_at: row.created_at,
    expires_at: row.expires_at,
    used: row.used,
    status: row.status,
    role: {
        role_id: row.role_id,
        role_name: row.role_name,
    },
});
