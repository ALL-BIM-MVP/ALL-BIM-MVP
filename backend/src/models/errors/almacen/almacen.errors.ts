import type { ErrorFormat } from "../app-error.js";

export const ALMACEN_ERRORS = {

    ESTILO_NOT_FOUND: {
        statusCode: 400,
        response: {
            code: "ALMACEN_ESTILO_NOT_FOUND",
            message: "El estilo de almacén indicado no existe."
        }
    },

    ALMACEN_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "ALMACEN_NOT_FOUND",
            message: "El almacén indicado no existe, ya fue dado de baja, o no pertenece a este proyecto."
        }
    },

    // "footprint" (esquina1/esquina2 del almacén) — invariante de la
    // propia fila, no relacionado con grid_ancho/grid_profundo (esos sí
    // son libres, ver comentario en database/schema.sql).
    FOOTPRINT_INVALIDO: {
        statusCode: 400,
        response: {
            code: "ALMACEN_FOOTPRINT_INVALIDO",
            message: "Las esquinas del almacén no pueden coincidir en X o en Z — el área tiene que ser mayor a cero."
        }
    },

    NOMBRE_DUPLICADO: {
        statusCode: 409,
        response: {
            code: "ALMACEN_NOMBRE_DUPLICADO",
            message: "Ya existe un almacén activo con ese nombre en este proyecto."
        }
    },

    // RESTRICT real de motor (estante.almacen_id) — este mensaje es la
    // traducción legible del bloqueo aplicado por el UPDATE guardado en
    // deleteAlmacenService (services/almacen/almacen.service.ts), no de
    // un 23503 (acá nunca se emite un DELETE de motor de verdad).
    TIENE_ESTANTES: {
        statusCode: 409,
        response: {
            code: "ALMACEN_TIENE_ESTANTES",
            message: "Este almacén todavía tiene estantes — hay que darlos de baja (o moverlos) antes de dar de baja el almacén."
        }
    },

} satisfies Record<string, ErrorFormat>;
