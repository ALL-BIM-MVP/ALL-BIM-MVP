import type { ErrorFormat } from "./app-error.js";


export const PROJECT_MEMBER_ERRORS = {
    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "PROJECT_MEMBER_NOT_FOUND",
            message: "El miembro solicitado no existe, no pertenece a este proyecto o no tienes permiso para gestionarlo."
        }
    },
    INVALID_ROLE: {
        statusCode: 400,
        response: {
            code: "PROJECT_MEMBER_INVALID_ROLE",
            message: "El rol de proyecto especificado no existe o no está disponible para asignarlo."
        }
    }
} satisfies Record<string, ErrorFormat>;
