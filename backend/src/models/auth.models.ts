import type { JwtPayload } from "jsonwebtoken";

export interface LoginData {
    email: string,
    password: string
};

export interface AuthPayload {
    user_id: number;
    email: string
}

export interface DecodedToken extends JwtPayload, AuthPayload {};

export interface Tokens {
    refresh_token: string,
    access_token: string
}