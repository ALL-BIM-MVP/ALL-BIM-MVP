import type { RespondToTheInvitation } from "../schemas/project-invitations.schema.js";

type AllowedStatus = RespondToTheInvitation | 'pendiente';

type ResponseStatusInvitation = AllowedStatus | 'vencido';


export interface EssentialData { 
    status: AllowedStatus, 
    email: string, 
    project_role_id: number, 
    owner_id: number,
    expires_at: Date,
};

interface ProjectRole {
    project_role_id : number;
    project_role_name : string;
};

interface HostInfo {
    user_id : number,
    user_name : string,
    user_email : string,
};

export interface InvitationBase {
    invitation_id: number;
    email : string;
    status : ResponseStatusInvitation;
    responded_at: Date | null;
    created_at: Date;
    expires_at: Date;
};

export interface ProjectInvitationBase extends InvitationBase {
    project_id: number;
};

interface ProjectInfo {
    project_id: number;
    project_name: string;
};



export interface ProjectInvitationRow extends ProjectInvitationBase {
    project_role_id: number;
    project_role_name : string;
    host_id: number;
    host_name: string;
    host_email: string;
};

export interface ProjectInvitationFull extends ProjectInvitationBase {
    project_role : ProjectRole,
    host : HostInfo
};

export const transformInvitationToInfoFull = (pi : ProjectInvitationRow) : ProjectInvitationFull => {
    return {
        invitation_id: pi.invitation_id,
        email : pi.email,
        status : pi.status,
        responded_at: pi.responded_at,
        created_at: pi.created_at,
        expires_at: pi.expires_at,
        project_id: pi.project_id,
        project_role : {
            project_role_id : pi.project_role_id,
            project_role_name : pi.project_role_name
        },
        host: {
            user_id: pi.host_id,
            user_name : pi.host_name,
            user_email: pi.host_email
        }
    };
};

interface InvitationForUserBase {
    invitation_id: number;
    status : ResponseStatusInvitation;
    responded_at: Date | null;
    created_at: Date;
    expires_at: Date;
    host_name:string;
    project_role_name: string;
}

export interface ProjectInvitationForUserRow extends InvitationForUserBase {
    project_id: number;
    project_name: string;
};

export interface ProjectInvitationForUser extends InvitationForUserBase {
    project: ProjectInfo;
};

export const transformInvitationForUser = (pi : ProjectInvitationForUserRow) : ProjectInvitationForUser => {
    return {
        invitation_id: pi.invitation_id,
        status : pi.status,
        responded_at: pi.responded_at,
        created_at: pi.created_at,
        expires_at: pi.expires_at,
        host_name: pi.host_name,
        project_role_name: pi.project_role_name,
        project: {
            project_id: pi.project_id,
            project_name : pi.project_name
        }
    };
};