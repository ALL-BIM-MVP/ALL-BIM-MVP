export interface User {
    user_id: number;
    role_id: number;
    name: string;
    password_hash: string;
    email: string;
    active: boolean;
    created_at: Date;
};

export interface UserResponse {
    user_id: number;
    role_id: number;
    role_name: string;
    name: string;
    email: string;
    active: boolean;
    created_at: Date;
};