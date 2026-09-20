import type { ErrorFormat } from "../app-error.js";

export const INVOICE_ERRORS = {

    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "INVOICE_NOT_FOUND",
            message: "La factura indicada no existe, ya fue dada de baja, o no pertenece a este proyecto."
        }
    },

    ITEM_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "INVOICE_ITEM_NOT_FOUND",
            message: "La línea indicada no existe o no pertenece a esta factura."
        }
    },

    // La misma factura (proveedor + serie + número) no se registra dos veces.
    DUPLICATE: {
        statusCode: 409,
        response: {
            code: "INVOICE_DUPLICATE",
            message: "Ya existe una factura activa de este proveedor con esa serie y ese número."
        }
    },

    LAST_ITEM: {
        statusCode: 409,
        response: {
            code: "INVOICE_LAST_ITEM",
            message: "Una factura necesita al menos una línea: no se puede quitar la última."
        }
    },

    // El proveedor de la factura tiene que ser el de la orden de compra de la que viene.
    SUPPLIER_MISMATCH: {
        statusCode: 400,
        response: {
            code: "INVOICE_SUPPLIER_MISMATCH",
            message: "El proveedor de la factura debe ser el mismo de la orden de compra de la que viene."
        }
    },

    // La línea cita una línea de orden que no es de la orden de esta factura (o la factura no tiene orden).
    LINK_INVALID: {
        statusCode: 400,
        response: {
            code: "INVOICE_LINK_INVALID",
            message: "La línea cita una línea de orden de compra que no pertenece a la orden de esta factura."
        }
    },

    // Trazabilidad de línea: si la factura dice de qué orden viene, cada línea cita la línea de esa orden.
    LINK_REQUIRED: {
        statusCode: 400,
        response: {
            code: "INVOICE_LINK_REQUIRED",
            message: "Cada línea de una factura con orden de compra de origen debe citar la línea de esa orden. Lo que no viene de la orden va en otra factura."
        }
    },

    PRODUCT_MISMATCH: {
        statusCode: 400,
        response: {
            code: "INVOICE_PRODUCT_MISMATCH",
            message: "El producto de la línea debe ser el mismo de la línea de orden que cita."
        }
    },

    // Sin orden de origen, la línea tiene que decir su producto.
    PRODUCT_REQUIRED: {
        statusCode: 400,
        response: {
            code: "INVOICE_PRODUCT_REQUIRED",
            message: "Una línea de una factura sin orden de compra de origen debe indicar su producto."
        }
    },

} satisfies Record<string, ErrorFormat>;
