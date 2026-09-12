import type { ErrorFormat } from "../app-error.js";

export const PRODUCT_ERRORS = {

    PRODUCT_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "PRODUCT_NOT_FOUND",
            message: "El producto indicado no existe, ya fue dado de baja, o no pertenece a este proyecto."
        }
    },

    // El body no sabe de antemano si category_id resultó 'fijo' o
    // 'relacional' (eso lo resuelve el service consultando la
    // categoría) — por eso esta validación no puede ir en el schema de
    // Zod, se resuelve acá después de mirar la categoría real.
    CODE_REQUIRED: {
        statusCode: 400,
        response: {
            code: "PRODUCT_CODE_REQUIRED",
            message: "Esta categoría es fija — hace falta `code` (texto libre), no `base_product_code`."
        }
    },

    BASE_PRODUCT_CODE_REQUIRED: {
        statusCode: 400,
        response: {
            code: "PRODUCT_BASE_PRODUCT_CODE_REQUIRED",
            message: "Esta categoría es relacional — hace falta `base_product_code` (el código de la Partida relacionada), no `code`."
        }
    },

    // `base_product_code` tiene que matchear el código de un producto
    // real de la categoría base (ej. Partida) — a propósito no es una
    // FK de motor (ver diseño 2.2), se valida acá.
    BASE_PRODUCT_NOT_FOUND: {
        statusCode: 400,
        response: {
            code: "PRODUCT_BASE_PRODUCT_NOT_FOUND",
            message: "No existe ninguna Partida activa con ese código en este proyecto."
        }
    },

    DUPLICATE_CODE: {
        statusCode: 409,
        response: {
            code: "PRODUCT_DUPLICATE_CODE",
            message: "Ya existe un producto activo con ese código en este proyecto."
        }
    },

    // RESTRICT real de motor (bin_contents.product_id) — este mensaje
    // es la traducción legible del bloqueo aplicado por el UPDATE
    // guardado en deleteProductService, no de un 23503.
    HAS_STOCK: {
        statusCode: 409,
        response: {
            code: "PRODUCT_HAS_STOCK",
            message: "Este producto todavía tiene stock guardado en alguna casilla — hay que sacarlo (Vale de Salida) antes de dar de baja el producto."
        }
    },

} satisfies Record<string, ErrorFormat>;
