import type { ErrorFormat } from "../app-error.js";

export const GOODS_RECEIPT_ERRORS = {

    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "GOODS_RECEIPT_NOT_FOUND",
            message: "El ingreso indicado no existe o no pertenece a este proyecto."
        }
    },

    // La misma guía (proveedor + serie + número) no se registra dos veces.
    DUPLICATE_DELIVERY_NOTE: {
        statusCode: 409,
        response: {
            code: "GOODS_RECEIPT_DUPLICATE_DELIVERY_NOTE",
            message: "Ya existe un ingreso de este proveedor con esa serie y ese número de guía."
        }
    },

    // Una entrada rápida es la que no tiene documentos previos: no cita orden.
    ENTRY_TYPE_MISMATCH: {
        statusCode: 400,
        response: {
            code: "GOODS_RECEIPT_ENTRY_TYPE_MISMATCH",
            message: "Una entrada rápida no tiene orden de compra: use el tipo de entrada normal para citar una orden."
        }
    },

    // El proveedor del ingreso tiene que ser el de la orden de compra.
    SUPPLIER_MISMATCH: {
        statusCode: 400,
        response: {
            code: "GOODS_RECEIPT_SUPPLIER_MISMATCH",
            message: "El proveedor del ingreso debe ser el mismo de la orden de compra que cita."
        }
    },

    // La línea cita una línea de orden que no es de la orden del ingreso (o el ingreso no tiene orden).
    LINK_INVALID: {
        statusCode: 400,
        response: {
            code: "GOODS_RECEIPT_LINK_INVALID",
            message: "La línea cita una línea de orden de compra que no pertenece a la orden de este ingreso."
        }
    },

    // Trazabilidad de línea: si el ingreso cita una orden, cada línea cita la línea de esa orden.
    LINK_REQUIRED: {
        statusCode: 400,
        response: {
            code: "GOODS_RECEIPT_LINK_REQUIRED",
            message: "Cada línea de un ingreso con orden de compra debe citar la línea de esa orden. Lo que no viene de la orden va en otro ingreso."
        }
    },

    PRODUCT_MISMATCH: {
        statusCode: 400,
        response: {
            code: "GOODS_RECEIPT_PRODUCT_MISMATCH",
            message: "El producto de la línea debe ser el mismo de la línea de orden que cita."
        }
    },

    // Sin orden, la línea tiene que decir su producto.
    PRODUCT_REQUIRED: {
        statusCode: 400,
        response: {
            code: "GOODS_RECEIPT_PRODUCT_REQUIRED",
            message: "Una línea de un ingreso sin orden de compra debe indicar su producto."
        }
    },

    // Al vincular una orden después, hay que indicar la línea de orden de TODAS las líneas del ingreso.
    LINK_ITEMS_MISMATCH: {
        statusCode: 400,
        response: {
            code: "GOODS_RECEIPT_LINK_ITEMS_MISMATCH",
            message: "Hay que indicar la línea de orden de cada una de las líneas del ingreso, sin repetir ni omitir ninguna."
        }
    },

} satisfies Record<string, ErrorFormat>;
