import type { ErrorFormat } from "./app-error.js";


export const IFC_CLASSIFICATION_ERRORS = {
    FIELDS_REQUIRED: {
        statusCode: 400,
        response: {
            code: "IFC_CLASSIFICATION_FIELDS_REQUIRED",
            message: "Hay que indicar al menos la propiedad de código (code_property_name) cuando mode='manual'."
        }
    },
    MODE_LOCKED: {
        statusCode: 409,
        response: {
            code: "IFC_CLASSIFICATION_MODE_LOCKED",
            message: "El modo de clasificación de este proyecto está bloqueado — solo un administrador puede desbloquearlo o cambiarlo."
        }
    },
    PREFIX_LOCKED: {
        statusCode: 409,
        response: {
            code: "IFC_CLASSIFICATION_PREFIX_LOCKED",
            message: "El prefijo de propiedades de este proyecto está bloqueado — solo un administrador puede desbloquearlo o cambiarlo."
        }
    }
} satisfies Record<string, ErrorFormat>;
