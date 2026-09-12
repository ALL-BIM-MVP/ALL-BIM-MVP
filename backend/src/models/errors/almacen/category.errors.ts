import type { ErrorFormat } from "../app-error.js";

export const CATEGORY_ERRORS = {

    CATEGORY_NOT_FOUND: {
        statusCode: 400,
        response: {
            code: "CATEGORY_NOT_FOUND",
            message: "La categoría indicada no existe o no pertenece a este proyecto."
        }
    },

} satisfies Record<string, ErrorFormat>;
