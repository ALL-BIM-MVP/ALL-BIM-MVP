import type { ErrorFormat } from "./app-error.js";


export const IFC_CLASSIFICATION_ERRORS = {
    PREFIX_REQUIRED: {
        statusCode: 400,
        response: {
            code: "IFC_CLASSIFICATION_PREFIX_REQUIRED",
            message: "property_prefix es obligatorio cuando mode='manual' — todavía no existe un modo sin prefijo."
        }
    },
    FIELDS_REQUIRED: {
        statusCode: 400,
        response: {
            code: "IFC_CLASSIFICATION_FIELDS_REQUIRED",
            message: "Hay que indicar al menos la propiedad de código (code_property_name) cuando mode='manual'."
        }
    },
    CONFIG_LOCKED: {
        statusCode: 409,
        response: {
            code: "IFC_CLASSIFICATION_CONFIG_LOCKED",
            message: "La configuración de clasificación de este proyecto está bloqueada — solo un administrador puede desbloquearla o cambiarla."
        }
    }
} satisfies Record<string, ErrorFormat>;
