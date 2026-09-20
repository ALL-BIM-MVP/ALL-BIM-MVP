
import type { ErrorFormat } from "./app-error.js";


export const COMMON_ERRORS = {

    INVALID_ID_PARAM:{
        statusCode:400,
        response:{
            code:"INVALID_ID_PARAM",
            message:"El identificador recibido no es válido."
        }
    },

    INVALID_ROUTE_PARAMS: {
        statusCode: 400,
        response: {
            code: "INVALID_ROUTE_PARAMS",
            message: "Los parámetros de la ruta no son válidos."
        }
    },

    INTERNAL_SERVER_ERROR:{
        statusCode:500,
        response:{
            code:"INTERNAL_SERVER_ERROR",
            message:"Problema interno del servidor."
        }
    },

    INVALID_REQUEST_DATA: {
        statusCode: 400,
        response: {
            code: "INVALID_REQUEST_DATA",
            message: "Los datos enviados no son válidos."
        }
    },

    INVALID_QUERY_PARAMETER: {
        statusCode: 400,
        response: {
            code: "INVALID_QUERY_PARAMETER",
            message: "Los parámetros de consulta enviados no son válidos."
        }
    },

    // Lo lanza express.json() antes de llegar a ningún controller.
    INVALID_JSON_BODY: {
        statusCode: 400,
        response: {
            code: "INVALID_JSON_BODY",
            message: "El cuerpo de la solicitud no es un JSON válido."
        }
    },

    PAYLOAD_TOO_LARGE: {
        statusCode: 413,
        response: {
            code: "PAYLOAD_TOO_LARGE",
            message: "El cuerpo de la solicitud es demasiado grande."
        }
    }

} satisfies Record<string, ErrorFormat>;