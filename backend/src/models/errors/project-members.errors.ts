import type { ErrorFormat } from "./app-error.js";


export const PROJECT_MEMBER_ERRORS = {
    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "PROJECT_MEMBER_NOT_FOUND",
            message: "El miembro solicitado no existe o no pertenece a este proyecto."
        }
    },
    INVALID_MODULE_ROLE: {
        statusCode: 400,
        response: {
            code: "PROJECT_MEMBER_INVALID_MODULE_ROLE",
            message: "El rol de módulo especificado no existe o no pertenece a ese módulo."
        }
    },
    CANNOT_TARGET_OWNER: {
        statusCode: 400,
        response: {
            code: "PROJECT_MEMBER_CANNOT_TARGET_OWNER",
            message: "El propietario del proyecto no se gestiona como un miembro más."
        }
    }
} satisfies Record<string, ErrorFormat>;
