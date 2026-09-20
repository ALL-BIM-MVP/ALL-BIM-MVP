import type { ErrorFormat } from "./app-error.js";


export const FILE_ERRORS = {
    FILE_NOT_PROVIDED: {
        statusCode: 400,
        response: {
            code: "FILE_NOT_PROVIDED",
            message: "No se ha proporcionado ningún archivo para subir."
        }
    },
    INVALID_FILE_TYPE: {
        statusCode: 400,
        response: {
            code: "FILE_INVALID_TYPE",
            message: "Tipo de archivo no soportado."
        }
    },
    FILE_UPLOAD_FAILED: {
        statusCode: 500,
        response: {
            code: "FILE_UPLOAD_FAILED",
            message: "No se pudo guardar el archivo en el servidor."
        }
    },
    // El archivo es el documento físico de un documento de Almacén
    // (FK RESTRICT): se reemplaza o se quita desde el documento.
    FILE_IN_USE: {
        statusCode: 409,
        response: {
            code: "FILE_IN_USE",
            message: "El archivo está adjunto a un documento. Reemplácelo o quítelo desde el documento."
        }
    },
    FILE_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "FILE_NOT_FOUND",
            message: "El archivo solicitado no existe."
        }
    },
    FILE_MISSING_ON_DISK: {
        statusCode: 500,
        response: {
            code: "FILE_MISSING_ON_DISK",
            message: "El archivo existe en la base de datos pero no se encontró en el almacenamiento."
        }
    },
    THUMBNAIL_NOT_AVAILABLE: {
        statusCode: 404,
        response: {
            code: "THUMBNAIL_NOT_AVAILABLE",
            message: "Este archivo no tiene una miniatura disponible."
        }
    }
} satisfies Record<string, ErrorFormat>;
