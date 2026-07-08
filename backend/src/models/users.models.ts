export interface BaseUser {
    user_id: number;
    name: string;
    email: string;
    created_at: Date;
}

export interface UserLayout extends BaseUser {
    role_name: string;
}

export interface UserResponse extends UserLayout {
    role_id: number;
    active: boolean;
}

export interface User extends BaseUser {
    role_id: number;
    password_hash: string;
    active: boolean;
}