import type { ErrorFormat } from "./app-error.js";

export const PROJECT_IMAGE_ERRORS = {
    NO_COVER_IMAGE: {
        statusCode: 404,
        response: {
            code: "PROJECT_NO_COVER_IMAGE",
            message: "Este proyecto no tiene una imagen de portada propia para borrar (está mostrando la imagen por defecto)."
        }
    }
} satisfies Record<string, ErrorFormat>;
