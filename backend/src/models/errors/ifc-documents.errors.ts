import type { ErrorFormat } from "./app-error.js";


export const IFC_DOCUMENTS_ERRORS = {
    SPECIALTY_REQUIRED: {
        statusCode: 400,
        response: {
            code: "IFC_SPECIALTY_REQUIRED",
            message: "Hay que indicar specialty_id para crear un documento IFC nuevo, o replaces_ifc_document_id para subir una nueva versión de uno existente."
        }
    },
    SPECIALTY_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "IFC_SPECIALTY_NOT_FOUND",
            message: "La especialidad indicada no existe o está desactivada."
        }
    },
    DOCUMENT_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "IFC_DOCUMENT_NOT_FOUND",
            message: "El documento IFC indicado no existe en este proyecto."
        }
    },
    VERSION_ALREADY_PROCESSING: {
        statusCode: 409,
        response: {
            code: "IFC_VERSION_ALREADY_PROCESSING",
            message: "Ya hay una versión de este documento en procesamiento — esperá a que termine antes de subir otra."
        }
    }
} satisfies Record<string, ErrorFormat>;
