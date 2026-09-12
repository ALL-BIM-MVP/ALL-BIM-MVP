import type { ErrorFormat } from "../app-error.js";

export const ESTANTE_ERRORS = {

    ESTANTE_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "ESTANTE_NOT_FOUND",
            message: "El estante indicado no existe, ya fue dado de baja, o no pertenece a este almacén."
        }
    },

    ESTANTE_FUERA_DE_GRILLA: {
        statusCode: 400,
        response: {
            code: "ESTANTE_FUERA_DE_GRILLA",
            message: "El estante no entra en el espacio interior de este almacén (grid_ancho/grid_profundo)."
        }
    },

    ESTANTE_ESQUINAS_INVALIDAS: {
        statusCode: 400,
        response: {
            code: "ESTANTE_ESQUINAS_INVALIDAS",
            message: "Las esquinas del estante tienen que caer justo sobre la grilla de cubos (múltiplos exactos del tamaño de cubo) y no pueden coincidir en X o en Z."
        }
    },

    ESTANTE_PROFUNDIDAD_INVALIDA: {
        statusCode: 400,
        response: {
            code: "ESTANTE_PROFUNDIDAD_INVALIDA",
            message: "La profundidad de un estante (esquina2_z - esquina1_z, en cubos) tiene que ser exactamente 1 o 2."
        }
    },

    ESTANTE_SUPERA_NIVEL_MAXIMO: {
        statusCode: 400,
        response: {
            code: "ESTANTE_SUPERA_NIVEL_MAXIMO",
            message: "Este estante tiene más niveles de los que admite el estilo del almacén (nivel_maximo)."
        }
    },

    // Mismo criterio que ya usaba el prototipo (index.html,
    // validarColocacionEstante) — 1 cubo de pasillo obligatorio con
    // CUALQUIER otro estante activo del mismo almacén.
    ESTANTE_SIN_PASILLO: {
        statusCode: 409,
        response: {
            code: "ESTANTE_SIN_PASILLO",
            message: "Queda pegado o superpuesto a otro estante — hace falta dejar 1 cubo de pasillo libre entre ambos."
        }
    },

    NOMBRE_ESTANTE_DUPLICADO: {
        statusCode: 409,
        response: {
            code: "ESTANTE_NOMBRE_DUPLICADO",
            message: "Ya existe un estante activo con ese nombre en este almacén."
        }
    },

    // En la práctica un estante siempre tiene casillas (se generan
    // solas al crearlo) — este es el bloqueo real de dar de baja un
    // estante mientras cualquiera de sus casillas siga bloqueada (ver
    // CASILLA_ERRORS en casilla.errors.ts para las 2 causas posibles:
    // contenido con cantidad > 0, o participa de un merge).
    TIENE_CASILLAS: {
        statusCode: 409,
        response: {
            code: "ESTANTE_TIENE_CASILLAS",
            message: "Este estante todavía tiene casillas — hay que vaciarlas (sacar todo el contenido) antes de dar de baja el estante."
        }
    },

} satisfies Record<string, ErrorFormat>;
