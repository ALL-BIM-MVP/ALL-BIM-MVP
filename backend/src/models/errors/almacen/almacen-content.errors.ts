import type { ErrorFormat } from "../app-error.js";

export const ALMACEN_CONTENT_ERRORS = {

    // Eliminar un proyecto exige que Almacén esté vacío — vaciarlo es
    // una acción explícita y aparte (DELETE .../almacen/content), no un
    // efecto silencioso de borrar el proyecto: Almacén guarda el
    // registro de auditoría de cómo llegó cada material.
    NOT_EMPTY: {
        statusCode: 409,
        response: {
            code: "ALMACEN_CONTENT_NOT_EMPTY",
            message: "El proyecto todavía tiene datos de Almacén BIM. Hay que vaciar Almacén antes de eliminar el proyecto."
        }
    },

} satisfies Record<string, ErrorFormat>;
