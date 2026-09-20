import type { ErrorFormat } from "../app-error.js";

export const PURCHASE_REQUISITION_ERRORS = {

    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "PURCHASE_REQUISITION_NOT_FOUND",
            message: "El requerimiento indicado no existe, ya fue dado de baja, o no pertenece a este proyecto."
        }
    },

    ITEM_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "PURCHASE_REQUISITION_ITEM_NOT_FOUND",
            message: "La línea indicada no existe o no pertenece a este requerimiento."
        }
    },

    DUPLICATE_NUMBER: {
        statusCode: 409,
        response: {
            code: "PURCHASE_REQUISITION_DUPLICATE_NUMBER",
            message: "Ya existe un requerimiento activo con ese número en este proyecto."
        }
    },

    // Un requerimiento sin líneas no tiene sentido: la última no se quita.
    LAST_ITEM: {
        statusCode: 409,
        response: {
            code: "PURCHASE_REQUISITION_LAST_ITEM",
            message: "Un requerimiento necesita al menos una línea: no se puede quitar la última."
        }
    },

    // Una línea cotizada no cambia de cantidad/producto ni se quita: las
    // cotizaciones ya se hicieron sobre ella.
    ITEM_LOCKED: {
        statusCode: 409,
        response: {
            code: "PURCHASE_REQUISITION_ITEM_LOCKED",
            message: "La línea ya fue cotizada: no se puede cambiar su cantidad ni su producto, ni quitarla."
        }
    },

    HAS_DOCUMENTS: {
        statusCode: 409,
        response: {
            code: "PURCHASE_REQUISITION_HAS_DOCUMENTS",
            message: "No se puede dar de baja el requerimiento porque tiene cotizaciones registradas."
        }
    },

} satisfies Record<string, ErrorFormat>;
