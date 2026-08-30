import type { ErrorFormat } from "./app-error.js";


export const USER_ERRORS = {

    USER_ALREADY_EXISTS: {
        statusCode:409,
        response:{
            code:"USER_ALREADY_EXISTS",
            message:"El usuario ya está registrado."
        }
    },


    INVALID_USER_ROLE: {
        statusCode:400,
        response:{
            code:"INVALID_USER_ROLE",
            message:"El rol asignado al usuario no es válido."
        }
    },

    USER_NOT_FOUND: {
        statusCode:404,
        response:{
            code:"USER_NOT_FOUND",
            message:"El usuario no existe."
        }
    },

    USER_INACTIVE: {
        statusCode:403,
        response:{
            code:"USER_INACTIVE",
            message:"El usuario está desactivado."
        }
    },

    USER_DELETED: {
        statusCode:403,
        response:{
            code:"USER_DELETED",
            message:"Esta cuenta fue eliminada."
        }
    },

    // Un administrador intentó activar/desactivar o eliminar su PROPIA
    // cuenta por la ruta de administración — evita que se bloquee a sí
    // mismo por accidente. Para eliminar la propia cuenta existe la
    // ruta de autogestión (DELETE /users/me), que no pasa por acá.
    CANNOT_TARGET_SELF: {
        statusCode:400,
        response:{
            code:"CANNOT_TARGET_SELF",
            message:"No podés realizar esta acción sobre tu propia cuenta."
        }
    },

    // La cuenta ADMINISTRADOR (role_id=1) nunca se puede eliminar —
    // ni por autogestión ni por otro administrador. Es la única cuenta
    // que puede asignar el resto de los roles (is_assignable=false, ver
    // users.service.ts, ensureBootstrapAdminService) — perderla deja la
    // plataforma sin forma de administrarse. Reforzado también con un
    // CHECK a nivel de BD (database/schema.sql), esto es la primera
    // barrera (mensaje claro), no la única.
    CANNOT_DELETE_ADMINISTRATOR: {
        statusCode:400,
        response:{
            code:"CANNOT_DELETE_ADMINISTRATOR",
            message:"La cuenta de Administrador no se puede eliminar."
        }
    },

    NO_PROFILE_PICTURE: {
        statusCode:404,
        response:{
            code:"NO_PROFILE_PICTURE",
            message:"El usuario no tiene una foto de perfil propia."
        }
    },

    // Distinto de INVALID_REQUEST_DATA (COMMON_ERRORS) a propósito:
    // el body de la request está bien formado (multipart válido), el
    // problema es que sharp no pudo interpretar el contenido del
    // archivo como una imagen — se detecta recién al procesarlo, no en
    // el schema.
    INVALID_IMAGE_FILE: {
        statusCode:400,
        response:{
            code:"INVALID_IMAGE_FILE",
            message:"El archivo enviado no es una imagen válida."
        }
    }

} satisfies Record<string, ErrorFormat>;