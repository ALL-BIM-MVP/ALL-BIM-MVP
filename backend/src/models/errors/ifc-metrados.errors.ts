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
    INVALID_IFC_CONTENT: {
        statusCode: 422,
        response: {
            code: "IFC_INVALID_CONTENT",
            message: "El archivo subido no tiene el encabezado de un IFC válido (ISO-10303-21) — puede que la subida haya fallado o el archivo esté corrupto/incompleto."
        }
    },
    DRY_RUN_FAILED: {
        statusCode: 500,
        response: {
            code: "IFC_DRY_RUN_FAILED",
            message: "No se pudo probar la configuración contra este archivo — revisá que el IFC sea válido e intentá de nuevo."
        }
    },
    STATUS_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "IFC_STATUS_NOT_FOUND",
            message: "No existe información de procesamiento para ese archivo."
        }
    },
    PARTIDA_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "IFC_PARTIDA_NOT_FOUND",
            message: "La partida solicitada no existe o no pertenece a este archivo IFC."
        }
    }
} satisfies Record<string, ErrorFormat>;
