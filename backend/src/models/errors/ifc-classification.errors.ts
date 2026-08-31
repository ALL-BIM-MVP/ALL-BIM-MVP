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
    },
    // El permiso "configure" del módulo Metrados se le puede asignar a
    // cualquier miembro del proyecto (no solo al dueño/administradores)
    // — así que alcanza para editar la configuración, pero NO para
    // tocar los candados (mode_locked/property_prefix_locked): esos
    // existen justamente para que el dueño/administradores puedan
    // restringir a otros configuradores, así que otro configurador no
    // puede sacárselos de encima solo destildando el casillero.
    LOCK_PERMISSION_REQUIRED: {
        statusCode: 403,
        response: {
            code: "IFC_CLASSIFICATION_LOCK_PERMISSION_REQUIRED",
            message: "Solo el dueño o los administradores del proyecto pueden bloquear o desbloquear la configuración de clasificación."
        }
    }
} satisfies Record<string, ErrorFormat>;
