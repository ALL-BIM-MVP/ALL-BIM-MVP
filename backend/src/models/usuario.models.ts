export interface User {
    user_id: number;
    name: string;
    email: string;
    password_hash: string;
    active: boolean;
    created_at: string;
};