import type { ErrorFormat } from "./app-error.js";


export const PROJECT_INVITATION_ERRORS = {
    NOT_FOUND: {
        statusCode: 404,
        response: { 
            code: "PROJECT_INVITATION_NOT_FOUND", 
            message: "La invitación solicitada no existe o no pertenece a este proyecto." 
        }
    },
    INVALID_INVITATION_REQUEST: {
        statusCode: 400,
        response: { 
            code: "PROJECT_INVITATION_INVALID_REQUEST", 
            message: "No se puede enviar la invitación. Verifica que el correo no sea el tuyo, que el usuario no sea miembro actual o que no tenga una invitación pendiente activa." 
        }
    },
    USER_NOT_FOUND_IN_APP: {
        statusCode: 404,
        response: { 
            code: "PROJECT_INVITATION_USER_NOT_FOUND", 
            message: "El correo ingresado no pertenece a ningún usuario registrado en la aplicación." 
        }
    },
    ALREADY_RESPONDED: {
        statusCode: 400,
        response: { 
            code: "PROJECT_INVITATION_ALREADY_RESPONDED", 
            message: "Esta invitación ya ha sido procesada (aceptada, rechazada o cancelada) y no puede modificarse." 
        }
    },
    INVITATION_EXPIRED: {
        statusCode: 400,
        response: { 
            code: "PROJECT_INVITATION_EXPIRED", 
            message: "La invitación ha vencido y ya no puede ser aceptada ni modificada." 
        }
    },
    UNAUTHORIZED: {
        statusCode: 403,
        response: { 
            code: "PROJECT_INVITATION_UNAUTHORIZED_ACTION", 
            message: "No tienes permisos para realizar esta acción sobre la invitación." 
        }
    },
    CREATION_FAILED: {
        statusCode: 500,
        response: { 
            code: "PROJECT_INVITATION_CREATION_FAILED", 
            message: "Ocurrió un error inesperado al intentar generar la invitación en la base de datos." 
        }
    }

} satisfies Record<string, ErrorFormat>;
