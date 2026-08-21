import { toPublicUploadsUrl } from "./project-images.models.js";

export interface BaseUser {
    user_id: number;
    name: string;
    last_name: string | null;
    email: string;
    created_at: Date;
}

// profile_picture_path (interno, del servidor) -> profile_picture_url
// (lo que ve el cliente) — reusa el mismo helper genérico que las
// portadas de proyecto (solo hace path.relative contra
// PUBLIC_UPLOADS_DIR). Vive acá (un archivo de modelos, no de service)
// para que cualquier otro service pueda importarlo sin acoplarse a
// users.service.ts — lo usan, además de este archivo, project-members.service.ts,
// project-invitations.service.ts y auth.service.ts (ver
// docs/roadmap-modulos-y-permisos.md, Fase 1 — "adaptar endpoints que
// devuelven info de usuario").
export const toProfilePictureUrl = (path : string | null) : string | null =>
    path ? toPublicUploadsUrl(path) : null;

// profile_picture_url viaja siempre (null si no subió foto) — igual
// criterio que ProjectCoverImage.url: el frontend recibe una URL
// pública lista para <img src="...">, nunca el path físico del
// servidor. A diferencia de la portada de proyecto, acá SÍ puede ser
// null (no hay imagen "por defecto" real, ver comentario en
// database/schema.sql sobre profile_picture_path).
export interface UserLayout extends BaseUser {
    role_name: string;
    profile_picture_url: string | null;
}

export interface UserResponse extends UserLayout {
    role_id: number;
    active: boolean;
    is_deleted: boolean;
}

export interface User extends BaseUser {
    role_id: number;
    password_hash: string;
    active: boolean;
    profile_picture_path: string | null;
    is_deleted: boolean;
}

// Autocompletado al invitar (GET .../invitations/search-users) — el
// frontend YA muestra un avatar real ahí (ColaboradoresTab.tsx), por
// eso trae last_name Y profile_picture_url (a diferencia de otros
// listados de "atribución" como uploaded_by/owner_id/host, que solo
// llevan last_name).
export interface UserSuggestion {
    user_id: number;
    name: string;
    last_name: string | null;
    email: string;
    profile_picture_url: string | null;
}

// Respuesta de PUT/DELETE /users/me/photo — un solo campo, así el
// frontend pisa directo su estado en memoria sin re-pedir /users/me.
export interface ProfilePictureInfo {
    profile_picture_url: string | null;
}
