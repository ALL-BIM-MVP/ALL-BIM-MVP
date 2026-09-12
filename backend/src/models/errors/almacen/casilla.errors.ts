import type { ErrorFormat } from "../app-error.js";

export const CASILLA_ERRORS = {

    CASILLA_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "CASILLA_NOT_FOUND",
            message: "La casilla indicada no existe o no pertenece a este estante."
        }
    },

} satisfies Record<string, ErrorFormat>;
