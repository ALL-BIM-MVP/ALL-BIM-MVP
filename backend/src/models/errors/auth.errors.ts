import type { ErrorFormat } from "./app-error.js";

export const AUTH_ERRORS = {

    LOGIN_FAILED: {
        statusCode: 401,
        response: {
            code: "AUTH_LOGIN_FAILED",
            message: "Credenciales inválidas."
        }
    },

    ACCESS_TOKEN_MISSING: {
        statusCode: 401,
        response: { code: "AUTH_ACCESS_TOKEN_MISSING", message: "Access Token requerido." }
    },

    ACCESS_TOKEN_INVALID: {
        statusCode: 401,
        response: { code: "AUTH_ACCESS_TOKEN_INVALID",message: "Access Token inválido." }
    },

    ACCESS_TOKEN_EXPIRED: {
        statusCode: 401,
        response: { code: "AUTH_ACCESS_TOKEN_EXPIRED", message: "Access Token expirado." }
    },

    REFRESH_TOKEN_MISSING: {
        statusCode: 401,
        response: { code: "AUTH_REFRESH_TOKEN_MISSING", message: "Refresh Token requerido." }
    },

    REFRESH_TOKEN_INVALID: {
        statusCode: 401,
        response: { code: "AUTH_REFRESH_TOKEN_INVALID", message: "Refresh Token inválido." }
    },

    REFRESH_TOKEN_EXPIRED: {
        statusCode: 401,
        response: { code: "AUTH_REFRESH_TOKEN_EXPIRED", message: "La sesión expiró." }
    },


    IDENTITY_NOT_VERIFIED: {
        statusCode: 401,
        response: {
            code: "AUTH_IDENTITY_NOT_VERIFIED",
            message: "La identidad no pudo ser verificada."
        }
    },

    USER_INVITATION_ALREADY_EXISTS: {
        statusCode: 409,
        response: {
            code: "USER_INVITATION_ALREADY_EXISTS",
            message: "Ya existe una invitación pendiente para este usuario."
        }
    },
    USER_INVITATION_INVALID: {
        statusCode: 410,
        response: {
            code: "USER_INVITATION_INVALID",
            message: "La invitación no es válida."
        }
    },

    USER_INVITATION_EXPIRED: {
        statusCode: 410,
        response: {
            code: "USER_INVITATION_EXPIRED",
            message: "La invitación expiró."
        }
    },

    USER_INVITATION_USED: {
        statusCode: 410,
        response: {
            code: "USER_INVITATION_USED",
            message: "La invitación ya fue utilizada."
        }
    }

} satisfies Record<string, ErrorFormat>;
