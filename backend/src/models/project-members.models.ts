// project-members.models.ts — Fase 2 (reemplaza project_role_id por
// is_admin + module_roles, ver docs/roadmap-modulos-y-permisos.md).
//
// OJO: a propósito NO se agregaron acá last_name/profile_picture_url
// (Fase 1, ver users.models.ts) — el usuario pidió explícitamente
// dejar esa adaptación para el final, después de terminar los roles,
// para no tener que tocar este listado dos veces.

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
    user_email : string;
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
    email : string;
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
    email: row.user_email,
    is_owner: false,
    is_admin: row.is_admin,
    is_me: row.user_id === currentUserId,
    joined_at: row.joined_at,
    module_roles: row.is_admin ? [] : (row.module_roles ?? []),
});
