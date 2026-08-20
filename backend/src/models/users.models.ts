export interface BaseUser {
    user_id: number;
    name: string;
    last_name: string | null;
    email: string;
    created_at: Date;
}

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

export interface UserSuggestion {
    user_id: number;
    name: string;
    email: string;
}

// Respuesta de PUT/DELETE /users/me/photo — un solo campo, así el
// frontend pisa directo su estado en memoria sin re-pedir /users/me.
export interface ProfilePictureInfo {
    profile_picture_url: string | null;
}
