import type { ErrorFormat } from "../app-error.js";

export const GOODS_ISSUE_ERRORS = {

    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "GOODS_ISSUE_NOT_FOUND",
            message: "El vale de salida indicado no existe o no pertenece a este proyecto."
        }
    },

    DUPLICATE_NUMBER: {
        statusCode: 409,
        response: {
            code: "GOODS_ISSUE_DUPLICATE_NUMBER",
            message: "Ya existe un vale de salida con ese número en este proyecto."
        }
    },

} satisfies Record<string, ErrorFormat>;
