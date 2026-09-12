import type { ErrorFormat } from "../app-error.js";

export const WAREHOUSE_ERRORS = {

    STYLE_NOT_FOUND: {
        statusCode: 400,
        response: {
            code: "WAREHOUSE_STYLE_NOT_FOUND",
            message: "El estilo de almacén indicado no existe."
        }
    },

    WAREHOUSE_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "WAREHOUSE_NOT_FOUND",
            message: "El almacén indicado no existe, ya fue dado de baja, o no pertenece a este proyecto."
        }
    },

    // "footprint" (corner1/corner2 del warehouse) — invariante de la
    // propia fila, no relacionado con grid_width/grid_depth (esos sí
    // son libres, ver comentario en database/schema.sql).
    INVALID_FOOTPRINT: {
        statusCode: 400,
        response: {
            code: "WAREHOUSE_INVALID_FOOTPRINT",
            message: "Las esquinas del almacén no pueden coincidir en X o en Z — el área tiene que ser mayor a cero."
        }
    },

    DUPLICATE_NAME: {
        statusCode: 409,
        response: {
            code: "WAREHOUSE_DUPLICATE_NAME",
            message: "Ya existe un almacén activo con ese nombre en este proyecto."
        }
    },

    // RESTRICT real de motor (racks.warehouse_id) — este mensaje es la
    // traducción legible del bloqueo aplicado por el UPDATE guardado en
    // deleteWarehouseService (services/almacen/warehouse.service.ts),
    // no de un 23503 (acá nunca se emite un DELETE de motor de verdad).
    HAS_RACKS: {
        statusCode: 409,
        response: {
            code: "WAREHOUSE_HAS_RACKS",
            message: "Este almacén todavía tiene estantes — hay que darlos de baja (o moverlos) antes de dar de baja el almacén."
        }
    },

} satisfies Record<string, ErrorFormat>;
