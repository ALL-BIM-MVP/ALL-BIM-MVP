import type { ErrorFormat } from "./app-error.js";


export const IFC_METRADOS_ERRORS = {
    FILE_REQUIRED: {
        statusCode: 400,
        response: {
            code: "IFC_FILE_REQUIRED",
            message: "Hay que enviar un archivo .ifc (multipart) o el file_id de uno ya subido."
        }
    },
    FILE_NOT_IFC: {
        statusCode: 422,
        response: {
            code: "IFC_FILE_NOT_IFC",
            message: "El archivo indicado no es un IFC."
        }
    },
    STATUS_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "IFC_STATUS_NOT_FOUND",
            message: "No existe información de procesamiento para ese archivo."
        }
    }
} satisfies Record<string, ErrorFormat>;
