// project-members.models.ts — Fase 2 (reemplaza project_role_id por
// is_admin + module_roles, ver docs/roadmap-modulos-y-permisos.md).
//
// last_name/profile_picture_url (Fase 1, ver users.models.ts) SÍ van
// acá — este listado muestra a la persona de verdad (avatar dedicado
// ya armado en el frontend, ColaboradoresTab.tsx), a diferencia de
// campos de atribución como uploaded_by/owner_id/host, que solo
// llevan apellido.
import { toProfilePictureUrl } from "./users.models.js";

export interface MemberModuleRole {
    module_code : string;
    module_name : string;
    module_role_id : number;
    role_name : string;
};

// Fila cruda tal como sale de la query (module_roles ya viene armado
// como JSON agregado por Postgres, no un JOIN plano — un miembro puede
// tener 0..N roles de módulo).
export interface ProjectMemberRow {
    project_member_id : number;
    joined_at : Date;
    project_id : number;
    user_id : number;
    user_name : string;
    user_last_name : string | null;
    user_email : string;
    profile_picture_path : string | null;
    is_admin : boolean;
    module_roles : MemberModuleRole[];
};

// Lo que devuelve GET /:projectId/members — incluye al OWNER (fila
// sintética, sin project_member_id real, is_owner=true) y marca cuál
// fila sos vos mismo (is_me) para que el frontend no tenga que
// comparar IDs a mano. module_roles queda [] para el owner y para
// cualquier is_admin=true — no hay ninguna fila real de la que
// sacarlo (acceso total es un bypass, ver project-access.service.ts),
// inventar entradas "Administrador" ahí sería mostrar un dato que la
// BD no tiene.
export interface ProjectMemberListItem {
    project_member_id : number | null;
    user_id : number;
    user_name : string;
    user_last_name : string | null;
    email : string;
    profile_picture_url : string | null;
    is_owner : boolean;
    is_admin : boolean;
    is_me : boolean;
    joined_at : Date;
    module_roles : MemberModuleRole[];
};

export const transformMemberToListItem = (
    row : ProjectMemberRow, currentUserId : number
) : ProjectMemberListItem => ({
    project_member_id: row.project_member_id,
    user_id: row.user_id,
    user_name: row.user_name,
    user_last_name: row.user_last_name,
    email: row.user_email,
    profile_picture_url: toProfilePictureUrl(row.profile_picture_path),
    is_owner: false,
    is_admin: row.is_admin,
    is_me: row.user_id === currentUserId,
    joined_at: row.joined_at,
    module_roles: row.is_admin ? [] : (row.module_roles ?? []),
});
