import type { ErrorFormat } from "./app-error.js"; 

export const PROJECT_ROLE_ERRORS = {
    PROJECT_ROLE_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "PROJECT_ROLE_NOT_FOUND_OR_UNAUTHORIZED", 
            message: "El rol de proyecto no existe, es un rol por defecto del sistema o no tienes permiso para modificarlo."
        }
    },
    ROLE_IN_USE: {
        statusCode: 400,
        response: {
            code: "PROJECT_ROLE_IN_USE",
            message: "No se puede eliminar el rol porque está siendo utilizado por miembros de proyectos."
        }
    }
} satisfies Record<string, ErrorFormat>;