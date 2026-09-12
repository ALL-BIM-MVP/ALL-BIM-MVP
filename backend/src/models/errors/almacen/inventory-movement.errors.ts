import type { ErrorFormat } from "../app-error.js";

export const INVENTORY_MOVEMENT_ERRORS = {

    // Se rechaza ANTES de intentar el UPDATE (mensaje legible), pero el
    // UPDATE guardado en applyStockMovement (inventory-movement.service.ts)
    // es atómico y también lo rechazaría solo — el CHECK
    // (bin_contents.quantity >= 0) es el respaldo real de motor, esto
    // nunca depende únicamente de la validación de la aplicación.
    INSUFFICIENT_STOCK: {
        statusCode: 409,
        response: {
            code: "INSUFFICIENT_STOCK",
            message: "No hay suficiente stock de este producto en esa casilla para sacar esa cantidad."
        }
    },

} satisfies Record<string, ErrorFormat>;
