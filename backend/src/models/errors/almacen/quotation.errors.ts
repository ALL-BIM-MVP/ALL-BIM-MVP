import type { ErrorFormat } from "../app-error.js";

export const QUOTATION_ERRORS = {

    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "QUOTATION_NOT_FOUND",
            message: "La cotización indicada no existe, ya fue dada de baja, o no pertenece a este proyecto."
        }
    },

    ITEM_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "QUOTATION_ITEM_NOT_FOUND",
            message: "La línea indicada no existe o no pertenece a esta cotización."
        }
    },

    DUPLICATE_NUMBER: {
        statusCode: 409,
        response: {
            code: "QUOTATION_DUPLICATE_NUMBER",
            message: "Ya existe una cotización activa de este proveedor con ese número."
        }
    },

    // La línea del requerimiento tiene que ser del requerimiento al que
    // responde la cotización.
    REQUISITION_ITEM_NOT_IN_REQUISITION: {
        statusCode: 400,
        response: {
            code: "QUOTATION_REQUISITION_ITEM_INVALID",
            message: "La línea del requerimiento indicada no existe o no pertenece al requerimiento de esta cotización."
        }
    },

    DUPLICATE_REQUISITION_ITEM: {
        statusCode: 409,
        response: {
            code: "QUOTATION_REQUISITION_ITEM_DUPLICATED",
            message: "Esa línea del requerimiento ya está cotizada en esta cotización."
        }
    },

    // Hoy la línea cotizada usa siempre el producto de la línea del
    // requerimiento (la descripción guarda lo que dice la cotización).
    PRODUCT_MISMATCH: {
        statusCode: 400,
        response: {
            code: "QUOTATION_PRODUCT_MISMATCH",
            message: "El producto de la línea cotizada debe ser el mismo de la línea del requerimiento."
        }
    },

    INVALID_VALIDITY_DATE: {
        statusCode: 400,
        response: {
            code: "QUOTATION_INVALID_VALIDITY_DATE",
            message: "La validez de la cotización no puede ser anterior a su fecha."
        }
    },

    LAST_ITEM: {
        statusCode: 409,
        response: {
            code: "QUOTATION_LAST_ITEM",
            message: "Una cotización necesita al menos una línea: no se puede quitar la última."
        }
    },

} satisfies Record<string, ErrorFormat>;
