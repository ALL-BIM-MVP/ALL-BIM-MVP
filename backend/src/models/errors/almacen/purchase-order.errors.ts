import type { ErrorFormat } from "../app-error.js";

export const PURCHASE_ORDER_ERRORS = {

    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "PURCHASE_ORDER_NOT_FOUND",
            message: "La orden de compra indicada no existe, ya fue dada de baja, o no pertenece a este proyecto."
        }
    },

    ITEM_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "PURCHASE_ORDER_ITEM_NOT_FOUND",
            message: "La línea indicada no existe o no pertenece a esta orden de compra."
        }
    },

    DUPLICATE_NUMBER: {
        statusCode: 409,
        response: {
            code: "PURCHASE_ORDER_DUPLICATE_NUMBER",
            message: "Ya existe una orden de compra activa con ese número en este proyecto."
        }
    },

    LAST_ITEM: {
        statusCode: 409,
        response: {
            code: "PURCHASE_ORDER_LAST_ITEM",
            message: "Una orden de compra necesita al menos una línea: no se puede quitar la última."
        }
    },

    // El proveedor de la orden tiene que ser el de la cotización de la que viene.
    SUPPLIER_MISMATCH: {
        statusCode: 400,
        response: {
            code: "PURCHASE_ORDER_SUPPLIER_MISMATCH",
            message: "El proveedor de la orden debe ser el mismo de la cotización de la que viene."
        }
    },

    // La cotización indicada responde a otro requerimiento que el indicado.
    ORIGIN_MISMATCH: {
        statusCode: 400,
        response: {
            code: "PURCHASE_ORDER_ORIGIN_MISMATCH",
            message: "La cotización indicada no corresponde al requerimiento indicado."
        }
    },

    // La línea cita una línea de cotización/requerimiento que no es de la
    // cotización/requerimiento de esta orden (o la orden no tiene ese origen).
    LINK_INVALID: {
        statusCode: 400,
        response: {
            code: "PURCHASE_ORDER_LINK_INVALID",
            message: "La línea cita una línea de cotización o de requerimiento que no pertenece al origen de esta orden."
        }
    },

    // Trazabilidad de línea (pedido del cliente): las mismas líneas del requerimiento
    // deben llegar hasta el almacén, sin líneas ajenas. Si la orden dice de dónde
    // viene, cada línea debe citar la línea de ese origen.
    LINK_REQUIRED: {
        statusCode: 400,
        response: {
            code: "PURCHASE_ORDER_LINK_REQUIRED",
            message: "Cada línea de una orden con cotización o requerimiento de origen debe citar la línea de ese origen. Lo que no viene del origen va en otra orden, o se agrega primero al requerimiento."
        }
    },

    PRODUCT_MISMATCH: {
        statusCode: 400,
        response: {
            code: "PURCHASE_ORDER_PRODUCT_MISMATCH",
            message: "El producto de la línea debe ser el mismo de la línea de cotización o de requerimiento que cita."
        }
    },

    // Sin vínculo con un documento anterior, la línea tiene que decir su producto.
    PRODUCT_REQUIRED: {
        statusCode: 400,
        response: {
            code: "PURCHASE_ORDER_PRODUCT_REQUIRED",
            message: "Una línea que no cita una línea de cotización o de requerimiento debe indicar su producto."
        }
    },

    // Una línea con una factura activa no cambia de cantidad/montos ni se quita.
    ITEM_LOCKED: {
        statusCode: 409,
        response: {
            code: "PURCHASE_ORDER_ITEM_LOCKED",
            message: "La línea ya está en una factura o en un ingreso: no se puede cambiar su cantidad ni sus montos, ni quitarla."
        }
    },

    HAS_DOCUMENTS: {
        statusCode: 409,
        response: {
            code: "PURCHASE_ORDER_HAS_DOCUMENTS",
            message: "No se puede dar de baja la orden de compra porque tiene facturas o ingresos registrados."
        }
    },

} satisfies Record<string, ErrorFormat>;
