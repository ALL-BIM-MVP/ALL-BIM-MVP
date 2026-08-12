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
    }
} satisfies Record<string, ErrorFormat>;
