// models/errors/user.errors.ts

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
    }

} satisfies Record<string, ErrorFormat>;