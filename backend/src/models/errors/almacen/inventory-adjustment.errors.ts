import type { ErrorFormat } from "../app-error.js";

export const INVENTORY_ADJUSTMENT_ERRORS = {

    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "INVENTORY_ADJUSTMENT_NOT_FOUND",
            message: "El ajuste indicado no existe o no pertenece a este proyecto."
        }
    },

    // Un documento anulado ya no se ajusta, ni se vuelve a anular, ni se edita.
    ALREADY_VOIDED: {
        statusCode: 409,
        response: {
            code: "INVENTORY_ADJUSTMENT_ALREADY_VOIDED",
            message: "El documento ya fue anulado: no admite más ajustes ni cambios."
        }
    },

    // La línea indicada tiene que ser del documento que se ajusta.
    ITEM_NOT_IN_DOCUMENT: {
        statusCode: 400,
        response: {
            code: "INVENTORY_ADJUSTMENT_ITEM_NOT_IN_DOCUMENT",
            message: "Una de las líneas indicadas no pertenece al documento que se quiere ajustar."
        }
    },

    // Lo efectivo de una línea en una casilla (lo registrado más los ajustes) nunca es negativo.
    EFFECTIVE_BELOW_ZERO: {
        statusCode: 409,
        response: {
            code: "INVENTORY_ADJUSTMENT_EFFECTIVE_BELOW_ZERO",
            message: "El ajuste dejaría la cantidad de esa línea en esa casilla por debajo de cero."
        }
    },

    // Anular un documento que ya no tiene nada efectivo que revertir.
    NOTHING_TO_VOID: {
        statusCode: 409,
        response: {
            code: "INVENTORY_ADJUSTMENT_NOTHING_TO_VOID",
            message: "El documento no tiene cantidades efectivas que revertir."
        }
    },

    // Decisión B13 (2026-09-26, ver docs/almacen-ingreso-productos/09-roadmap-correcciones-2026-09-26.md):
    // por lógica, no se anula nada si parte ya salió del almacén — sería registrar una inconsistencia
    // entre lo guardado y lo físico. No hay anulación parcial: todo o nada, con este aviso explícito
    // en vez del genérico INSUFFICIENT_STOCK (que está pensado para cuando se intenta SACAR más de lo
    // que hay, no para esto).
    CANNOT_VOID_ALREADY_CONSUMED: {
        statusCode: 409,
        response: {
            code: "INVENTORY_ADJUSTMENT_CANNOT_VOID_ALREADY_CONSUMED",
            message: "No se puede anular: parte de lo que este documento puso en una casilla ya salió del almacén con un movimiento posterior (un vale u otro ajuste). Corrige o anula primero esos movimientos antes de volver a intentarlo."
        }
    },

} satisfies Record<string, ErrorFormat>;
