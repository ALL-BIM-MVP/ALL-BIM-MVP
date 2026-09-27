import type { ErrorFormat } from "../app-error.js";

export const BIN_ERRORS = {

    BIN_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "BIN_NOT_FOUND",
            message: "La casilla indicada no existe o no pertenece a este estante."
        }
    },

    CONTENT_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "BIN_CONTENT_NOT_FOUND",
            message: "El contenido indicado no existe o no está en esta casilla."
        }
    },

} satisfies Record<string, ErrorFormat>;
