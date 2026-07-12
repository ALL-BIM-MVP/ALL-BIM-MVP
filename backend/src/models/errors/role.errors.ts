import type { ErrorFormat } from "./app-error.js";


export const ROLE_ERRORS = {
    
    ROLE_NOT_ASSIGNABLE: {
        statusCode: 400,
        response: {
            code: "ROLE_NOT_ASSIGNABLE",
            message: "El rol seleccionado no puede ser asignado."
        }
    }

} satisfies Record<string, ErrorFormat>;