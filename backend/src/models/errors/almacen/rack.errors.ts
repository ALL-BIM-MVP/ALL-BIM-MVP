import type { ErrorFormat } from "../app-error.js";

export const RACK_ERRORS = {

    RACK_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "RACK_NOT_FOUND",
            message: "El estante indicado no existe, ya fue dado de baja, o no pertenece a este almacén."
        }
    },

    OUT_OF_GRID: {
        statusCode: 400,
        response: {
            code: "RACK_OUT_OF_GRID",
            message: "El estante no entra en el espacio interior de este almacén (grid_width/grid_depth)."
        }
    },

    INVALID_CORNERS: {
        statusCode: 400,
        response: {
            code: "RACK_INVALID_CORNERS",
            message: "Las esquinas del estante tienen que caer justo sobre la grilla de cubos (múltiplos exactos del tamaño de cubo) y no pueden coincidir en X o en Z."
        }
    },

    INVALID_DEPTH: {
        statusCode: 400,
        response: {
            code: "RACK_INVALID_DEPTH",
            message: "La profundidad de un estante (corner2_z - corner1_z, en cubos) tiene que ser exactamente 1 o 2."
        }
    },

    EXCEEDS_MAX_LEVEL: {
        statusCode: 400,
        response: {
            code: "RACK_EXCEEDS_MAX_LEVEL",
            message: "Este estante tiene más niveles de los que admite el estilo del almacén (max_level)."
        }
    },

    // Mismo criterio que ya usaba el prototipo (index.html,
    // validarColocacionEstante) — 1 cubo de pasillo obligatorio con
    // CUALQUIER otro estante activo del mismo almacén.
    NO_CLEARANCE: {
        statusCode: 409,
        response: {
            code: "RACK_NO_CLEARANCE",
            message: "Queda pegado o superpuesto a otro estante — hace falta dejar 1 cubo de pasillo libre entre ambos."
        }
    },

    DUPLICATE_NAME: {
        statusCode: 409,
        response: {
            code: "RACK_DUPLICATE_NAME",
            message: "Ya existe un estante activo con ese nombre en este almacén."
        }
    },

    // En la práctica un estante siempre tiene bins (se generan solas al
    // crearlo) — este es el bloqueo real de dar de baja un estante
    // mientras cualquiera de sus bins siga bloqueado (ver BIN_ERRORS en
    // bin.errors.ts para las 2 causas posibles: contenido con
    // quantity > 0, o participa de un merge).
    HAS_BINS: {
        statusCode: 409,
        response: {
            code: "RACK_HAS_BINS",
            message: "Este estante todavía tiene casillas — hay que vaciarlas (sacar todo el contenido) antes de dar de baja el estante."
        }
    },

} satisfies Record<string, ErrorFormat>;
