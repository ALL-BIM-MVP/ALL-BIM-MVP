export interface MemberModuleRole {
  module_code: string;
  module_name: string;
  module_role_id: number;
  role_name: string;
}

export interface Invitation {
  invitation_id: number;
  email: string;
  status: 'pendiente' | 'aceptado' | 'rechazado' | 'cancelado' | 'expirado';
  responded_at: string | null;
  created_at: string;
  expires_at: string;
  project_id: number;
  is_admin: boolean;
  module_roles: MemberModuleRole[];
  host: {
    user_id: number;
    user_name: string;
    user_last_name: string | null;
    user_email: string;
  };
}

// Forma en la que le llega una invitación al usuario INVITADO (distinta
// de Invitation, que es la vista del lado de quien administra el
// proyecto) — ver ProjectInvitationForUser en el backend.
export interface MyInvitation {
  invitation_id: number;
  status: 'pendiente' | 'aceptado' | 'rechazado' | 'cancelado' | 'expirado';
  responded_at: string | null;
  created_at: string;
  expires_at: string;
  host_name: string;
  host_last_name: string | null;
  is_admin: boolean;
  module_roles: MemberModuleRole[];
  project: {
    project_id: number;
    project_name: string;
  };
}

export interface UserSearchResult {
  user_id: number;
  name: string;
  last_name: string | null;
  email: string;
  profile_picture_url: string | null;
}

export interface CreateInvitationRequest {
  email: string;
  is_admin: boolean;
  module_roles: { module_code: string; module_role_id: number }[];
}

export interface UpdateInvitationRequest {
  status: 'aceptado' | 'rechazado' | 'cancelado';
}

export interface ProjectMember {
  project_member_id: number | null;
  user_id: number;
  user_name: string;
  user_last_name: string | null;
  // OJO: el backend devuelve este campo como "email" (no "user_email"),
  // ver ProjectMemberListItem en project-members.models.ts.
  email: string;
  profile_picture_url: string | null;
  is_owner: boolean;
  is_admin: boolean;
  is_me: boolean;
  module_roles: MemberModuleRole[];
  joined_at: string;
}