interface MemberUserInfo {
    user_id : number;
    user_name : string;
    user_email : string;
};

interface MemberProjectRole {
    project_role_id : number;
    project_role_name : string;
};

export interface ProjectMemberBase {
    project_member_id: number;
    joined_at: Date;
    project_id: number;
};

export interface ProjectMemberRow extends ProjectMemberBase {
    user_id : number;
    user_name : string;
    user_email : string;
    project_role_id : number;
    project_role_name : string;
};

export interface ProjectMemberFull extends ProjectMemberBase {
    user : MemberUserInfo;
    project_role : MemberProjectRole;
};

export const transformMemberToFull = (pm : ProjectMemberRow) : ProjectMemberFull => {
    return {
        project_member_id: pm.project_member_id,
        joined_at: pm.joined_at,
        project_id: pm.project_id,
        user: {
            user_id: pm.user_id,
            user_name: pm.user_name,
            user_email: pm.user_email
        },
        project_role: {
            project_role_id: pm.project_role_id,
            project_role_name: pm.project_role_name
        }
    };
};

// Forma plana (sin anidar) para el listado — la usa el frontend ya
// integrado con esta forma, a diferencia de ProjectMemberFull (que
// sigue usando el PATCH de cambio de rol, sin tocar).
export interface ProjectMemberListItem {
    project_member_id : number;
    user_id : number;
    user_name : string;
    email : string;
    project_role_id : number;
    project_role_name : string;
};

export const transformMemberToListItem = (pm : ProjectMemberListItem) : ProjectMemberListItem => pm;

interface CurrentUserProjectRoleRow {
    is_owner : boolean;
    role_id : number | null;
    role_name : string | null;
};

export interface CurrentUserProjectRole {
    role_id : number | null;
    role_name : string;
    is_owner : boolean;
};

export const transformToCurrentUserProjectRole = (row : CurrentUserProjectRoleRow) : CurrentUserProjectRole => {
    return {
        role_id: row.role_id,
        role_name: row.is_owner ? 'Propietario' : (row.role_name ?? 'Sin rol'),
        is_owner: row.is_owner
    };
};
