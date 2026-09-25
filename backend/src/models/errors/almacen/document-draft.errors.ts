import type { ErrorFormat } from "../app-error.js";

// Errores de la lectura de documentos con IA (borradores).
export const DOCUMENT_DRAFT_ERRORS = {

    AI_NOT_CONFIGURED: {
        statusCode: 503,
        response: {
            code: "DOCUMENT_DRAFT_AI_NOT_CONFIGURED",
            message: "La lectura de documentos con IA no está configurada en el servidor. Se puede llenar el documento a mano."
        }
    },

    AI_UNAVAILABLE: {
        statusCode: 502,
        response: {
            code: "DOCUMENT_DRAFT_AI_UNAVAILABLE",
            message: "El servicio de lectura no respondió. Intenta de nuevo en unos minutos o llena el documento a mano."
        }
    },

    AI_TIMEOUT: {
        statusCode: 504,
        response: {
            code: "DOCUMENT_DRAFT_AI_TIMEOUT",
            message: "La lectura del documento tardó demasiado. Intenta de nuevo o llena el documento a mano."
        }
    },

    AI_BAD_OUTPUT: {
        statusCode: 502,
        response: {
            code: "DOCUMENT_DRAFT_AI_BAD_OUTPUT",
            message: "No se pudo interpretar la lectura del documento. Intenta con una imagen más clara o llena el documento a mano."
        }
    },

    FILE_TYPE_NOT_SUPPORTED: {
        statusCode: 400,
        response: {
            code: "DOCUMENT_DRAFT_FILE_TYPE_NOT_SUPPORTED",
            message: "Solo se pueden leer imágenes (PNG, JPG, WEBP) y archivos PDF."
        }
    },

    FILE_TOO_LARGE: {
        statusCode: 400,
        response: {
            code: "DOCUMENT_DRAFT_FILE_TOO_LARGE",
            message: "El archivo es demasiado grande para leerlo (máximo 15 MB)."
        }
    },

    FILE_UNREADABLE: {
        statusCode: 404,
        response: {
            code: "DOCUMENT_DRAFT_FILE_UNREADABLE",
            message: "No se pudo abrir el archivo en el servidor."
        }
    },

} satisfies Record<string, ErrorFormat>;
