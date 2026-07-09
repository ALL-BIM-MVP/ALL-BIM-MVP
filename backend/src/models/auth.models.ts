import type { JwtPayload } from "jsonwebtoken";
import type { Request } from 'express';

export interface AuthResponse {
    access_token: string;
    refresh_token: string;
    rol_id: number;
    user?: {
        id: number;
        name: string;
        correo: string;  
    };
}

export interface AuthPayload {
    role_id: number;
    user_id: number;
    email: string;
}

export interface DecodedToken extends JwtPayload, AuthPayload {};

export interface Tokens {
    refresh_token: string;
    access_token: string;
}

export interface ValidateResponse {
    role_id : number,
    role_name : string,
    email : string
}   

export interface InvitationResponse {
    token: string;
    link: string;
}