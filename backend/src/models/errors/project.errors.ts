
import type { ErrorFormat } from "./app-error.js"; 

export const PROJECT_ERRORS = {
    PROJECT_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "PROJECT_NOT_FOUND_OR_UNAUTHORIZED", 
            message: "El proyecto no existe o no tienes autorización para verlo."
        }
    },

    NO_FIELDS_TO_UPDATE: {
        statusCode: 400,
        response : {
            message: "No se proporcionaron campos válidos para actualizar el proyecto.",
            code: "NO_FIELDS_TO_UPDATE"
        }
    }
} satisfies Record<string, ErrorFormat>;