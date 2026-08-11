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
