import type { ErrorFormat } from "./app-error.js";


export const PERMISSION_ERRORS = {

    ADMIN_PERMISSION_REQUIRED:{
        statusCode:403,
        response:{
            code:"ADMIN_PERMISSION_REQUIRED",
            message:"Se requiere permiso de administrador."
        }
    },


    OWNER_PERMISSION_REQUIRED:{
        statusCode:403,
        response:{
            code:"OWNER_PERMISSION_REQUIRED",
            message:"Se requiere permiso del propietario."
        }
    },


    INSUFFICIENT_PERMISSIONS:{
        statusCode:403,
        response:{
            code:"INSUFFICIENT_PERMISSIONS",
            message:"No tiene permisos suficientes."
        }
    }

} satisfies Record<string, ErrorFormat>;