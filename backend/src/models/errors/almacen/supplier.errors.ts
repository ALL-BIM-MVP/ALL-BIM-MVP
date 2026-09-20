import type { ErrorFormat } from "../app-error.js";

export const SUPPLIER_ERRORS = {

    SUPPLIER_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "SUPPLIER_NOT_FOUND",
            message: "El proveedor indicado no existe, ya fue dado de baja, o no pertenece a este proyecto."
        }
    },

    DUPLICATE_RUC: {
        statusCode: 409,
        response: {
            code: "SUPPLIER_DUPLICATE_RUC",
            message: "Ya existe un proveedor activo con ese RUC en este proyecto."
        }
    },

    // El RUC identifica a la empresa: una vez que algún documento usa a
    // este proveedor, cambiarlo convertiría a un proveedor en otro sin
    // que los documentos lo sepan. El nombre (razón social) sí se puede
    // editar siempre.
    RUC_LOCKED: {
        statusCode: 409,
        response: {
            code: "SUPPLIER_RUC_LOCKED",
            message: "El RUC ya no se puede cambiar porque este proveedor tiene documentos registrados. El nombre sí se puede editar."
        }
    },

    HAS_DOCUMENTS: {
        statusCode: 409,
        response: {
            code: "SUPPLIER_HAS_DOCUMENTS",
            message: "No se puede dar de baja el proveedor porque tiene documentos registrados."
        }
    },

} satisfies Record<string, ErrorFormat>;
