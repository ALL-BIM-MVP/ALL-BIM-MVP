import type { JwtPayload } from "jsonwebtoken";
import type { Request } from 'express';

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


export interface AuthenticatedRequest extends Request {
  user: NonNullable<Request['user']>; // Vuelve el 'user' obligatorio
}