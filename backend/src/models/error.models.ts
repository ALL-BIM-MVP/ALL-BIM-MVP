
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
    | "USER_EXISTS" 
    | "INVALID_ROLE" 
    | "INVALID_INVITATION"
    
    | "TOKEN_ACCESS_UNDEFINED"
    | "TOKEN_ACCESS_INVALID"
    | "TOKEN_ACCESS_EXPIRED"

    | "TOKEN_REFRESH_UNDEFINED"
    | "TOKEN_REFRESH_INVALID"
    | "TOKEN_REFRESH_EXPIRED"
    
    | "AUTH_IDENTITY_UNKNOWN"
    | "FORBIDDEN_OWNER"
    | "FORBIDDEN_ADMIN"
    
    | "INVALID_ID_PARAM"
    | "RESOURCE_NOT_FOUND"
    | "INTERNAL_SERVER_ERROR"

    | "AUTH_BAD_REQUEST"
    | "LOGIN_FAILED"
    | "USERS_BAD_REQUEST"
;

export const ERRORS: Readonly<Record<ErrorKeys, ErrorOptions>> = {
    USER_EXISTS: {
        statusCode: 409,
        response: { code: "AUTH_USER_ALREADY_EXISTS", message: "El usuario ya está registrado." }
    },
    INVALID_ROLE: {
        statusCode: 400,
        response: { code: "AUTH_INVALID_ROLE", message: "El rol es inválido." }
    },
    INVALID_INVITATION: {
        statusCode: 410,
        response: { code: "AUTH_INVALID_INVITATION", message: "La invitación es inválida, expiró o ya fue utilizada." } 
    },

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

    AUTH_IDENTITY_UNKNOWN: {
        statusCode: 401,
        response: { code: "AUTH_IDENTITY_UNKNOWN", message: "Identidad no verificada o sin acceso." }
    },
    FORBIDDEN_OWNER: {
        statusCode: 403,
        response: { code: "AUTH_FORBIDDEN_RESOURCE_OWNER", message: "Acceso Prohibido a los datos." }
    },
    FORBIDDEN_ADMIN: {
        statusCode: 403,
        response: { code: "AUTH_FORBIDDEN_REQUIRES_ADMIN", message: "Se requiere privilegios de administrador." }
    },

    INVALID_ID_PARAM: {
        statusCode: 400,
        response: { code: "BAD_REQUEST_INVALID_ID", message: "Parámetro 'id' inválido." }
    },
    RESOURCE_NOT_FOUND: {
        statusCode: 404,
        response: { code: "NOT_FOUND_RESOURCE", message: "El recurso solicitado no existe." }
    },

    AUTH_BAD_REQUEST: {
        statusCode: 400,
        response: { code: "AUTH_BAD_REQUEST", message: "Los datos enviados son inválidos o están incompletos." }
    },
    LOGIN_FAILED: {
        statusCode: 401,
        response: { code: "AUTH_LOGIN_FAILED", message: "Credenciales inválidas." }
    },
    USERS_BAD_REQUEST: {
        statusCode: 400,
        response: { code: "USERS_BAD_REQUEST", message: "Los recursos de consulta o filtros son inválidos." }
    },

    INTERNAL_SERVER_ERROR: {
        statusCode: 500,
        response: { code: "INTERNAL_SERVER_ERROR", message: "Problema interno del servidor." }
    }
};