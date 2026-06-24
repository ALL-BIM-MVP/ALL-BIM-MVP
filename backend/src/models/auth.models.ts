import type { JwtPayload } from "jsonwebtoken";

export interface Login {
    correo: string,
    contrasena: string
};

export interface AuthPayload {
    usuario_id: number;
    correo: string
}

export interface DecodedToken extends JwtPayload, AuthPayload {};

export interface Tokens {
    refresh_token: string,
    access_token: string
}