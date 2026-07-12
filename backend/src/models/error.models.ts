
interface ErrorResponse {
    code: string,
    message: string,
}

interface ErrorOptions {
    statusCode: number;
    response: ErrorResponse;
};

export class AppError extends Error {
    public statusCode : number;
    public response: ErrorResponse;

    constructor(options: ErrorOptions) {
        super(options.response.message); // El mensaje sigue yendo al Error nativo de JS
        this.name = "AppError";
        this.statusCode = options.statusCode;
        this.response = options.response;
    }
}


type ErrorKeys = 
    | "TOKEN_ACCESS_UNDEFINED"
    | "TOKEN_ACCESS_INVALID"
    | "TOKEN_ACCESS_EXPIRED"

    | "TOKEN_REFRESH_UNDEFINED"
    | "TOKEN_REFRESH_INVALID"
    | "TOKEN_REFRESH_EXPIRED"
    
;

export const ERRORS: Readonly<Record<ErrorKeys, ErrorOptions>> = {


    TOKEN_ACCESS_UNDEFINED: {
        statusCode: 401,
        response: { code: "AUTH_TOKEN_ACCESS_UNDEFINED", message: "Token requerido, no recibido correctamente." }
    },
    TOKEN_ACCESS_INVALID: {
        statusCode: 401,
        response: { code: "AUTH_TOKEN_ACCESS_INVALID", message: "Token inválido, no pertenece a ALL-BIM." }
    },
    TOKEN_ACCESS_EXPIRED: {
        statusCode: 403, // 403 avisa al frontend que debe intentar usar el Refresh Token
        response: { code: "AUTH_TOKEN_ACCESS_EXPIRED", message: "Access Token ha expirado su tiempo de uso." }
    },

    TOKEN_REFRESH_UNDEFINED: {
        statusCode: 401,
        response: { code: "AUTH_TOKEN_REFRESH_UNDEFINED", message: "Refresh Token requerido." }
    },
    TOKEN_REFRESH_INVALID: {
        statusCode: 401,
        response: { code: "AUTH_TOKEN_REFRESH_INVALID", message: "Refresh Token inválido o corrupto." }
    },
    TOKEN_REFRESH_EXPIRED: {
        statusCode: 401, // 401 obliga a desloguear por completo e ir al Login
        response: { code: "AUTH_TOKEN_REFRESH_EXPIRED", message: "Su sesión ha expirado por inactividad. Inicie sesión de nuevo." }
    },

};