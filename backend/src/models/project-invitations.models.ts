import type { RespondToTheInvitation } from "../schemas/project-invitations.schema.js";

type AllowedStatus = RespondToTheInvitation | 'pendiente';

type ResponseStatusInvitation = AllowedStatus | 'vencido';


export interface EssentialData {
    status: AllowedStatus,
    email: string,
    is_admin: boolean,
    owner_id: number,
    expires_at: Date,
};

export interface InvitationModuleRole {
    module_code : string;
    module_name : string;
    module_role_id : number;
    role_name : string;
};

// Sin imagen a propósito — "quién invitó" es atribución, no una
// vitrina de la persona (el frontend actual, ColaboradoresTab.tsx, ni
// siquiera muestra el nombre del invitado en la fila de invitación,
// solo su email — ver docs/roadmap-modulos-y-permisos.md, Fase 1).
interface HostInfo {
    user_id : number,
    user_name : string,
    user_last_name : string | null,
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
    is_admin: boolean;
    module_roles: InvitationModuleRole[];
    host_id: number;
    host_name: string;
    host_last_name: string | null;
    host_email: string;
};

export interface ProjectInvitationFull extends ProjectInvitationBase {
    is_admin: boolean;
    module_roles: InvitationModuleRole[];
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
        is_admin: pi.is_admin,
        module_roles: pi.module_roles ?? [],
        host: {
            user_id: pi.host_id,
            user_name : pi.host_name,
            user_last_name: pi.host_last_name,
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
    host_last_name: string | null;
    is_admin: boolean;
}

export interface ProjectInvitationForUserRow extends InvitationForUserBase {
    project_id: number;
    project_name: string;
    module_roles: InvitationModuleRole[];
};

export interface ProjectInvitationForUser extends InvitationForUserBase {
    module_roles: InvitationModuleRole[];
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
        host_last_name: pi.host_last_name,
        is_admin: pi.is_admin,
        module_roles: pi.module_roles ?? [],
        project: {
            project_id: pi.project_id,
            project_name : pi.project_name
        }
    };
};
