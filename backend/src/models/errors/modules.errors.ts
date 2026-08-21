import type { ErrorFormat } from "./app-error.js";

export const MODULE_ERRORS = {
    MODULE_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "MODULE_NOT_FOUND",
            message: "El módulo indicado no existe."
        }
    },
    MODULE_NOT_ACTIVE: {
        statusCode: 404,
        response: {
            code: "MODULE_NOT_ACTIVE",
            message: "Este módulo todavía no está disponible."
        }
    },
    MODULE_ROLE_NOT_FOUND: {
        statusCode: 400,
        response: {
            code: "MODULE_ROLE_NOT_FOUND",
            message: "El rol de módulo indicado no existe o no pertenece a ese módulo."
        }
    }
} satisfies Record<string, ErrorFormat>;
