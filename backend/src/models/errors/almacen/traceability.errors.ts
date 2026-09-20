import type { ErrorFormat } from "../app-error.js";

export const TRACEABILITY_ERRORS = {

    DOCUMENT_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "TRACEABILITY_DOCUMENT_NOT_FOUND",
            message: "El documento indicado no existe, ya fue dado de baja, o no pertenece a este proyecto."
        }
    },

} satisfies Record<string, ErrorFormat>;
