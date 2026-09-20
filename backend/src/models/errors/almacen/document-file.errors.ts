import type { ErrorFormat } from "../app-error.js";

// Errores del archivo físico adjunto a un documento de Almacén
// (requerimiento, y los documentos siguientes del roadmap).
export const DOCUMENT_FILE_ERRORS = {

    FILE_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "DOCUMENT_FILE_NOT_FOUND",
            message: "El archivo indicado no existe, no pertenece a este proyecto o no es un archivo de Almacén."
        }
    },

    FILE_ALREADY_ATTACHED: {
        statusCode: 409,
        response: {
            code: "DOCUMENT_FILE_ALREADY_ATTACHED",
            message: "Ese archivo ya está adjunto a otro documento."
        }
    },

} satisfies Record<string, ErrorFormat>;
