import type { ErrorFormat } from "../app-error.js";

export const GOODS_RECEIPT_ERRORS = {

    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "GOODS_RECEIPT_NOT_FOUND",
            message: "El ingreso indicado no existe o no pertenece a este proyecto."
        }
    },

} satisfies Record<string, ErrorFormat>;
