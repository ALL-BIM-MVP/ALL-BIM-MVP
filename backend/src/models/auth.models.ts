import type { JwtPayload } from "jsonwebtoken";
import type { Request } from 'express';

export interface AuthResponse {
    access_token: string;
    refresh_token: string;
    rol_id: number;
    // last_name/profile_picture_url viajan acá (login Y registro) para
    // que el frontend no tenga que pedir GET /users/me aparte justo
    // después de autenticar — profile_picture_url va a venir null en
    // un registro recién creado (todavía no subió foto, es opcional y
    // se configura después), pero el campo ya está listo en la forma
    // de la respuesta.
    user?: {
        id: number;
        name: string;
        last_name: string | null;
        correo: string;
        profile_picture_url: string | null;
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