import type { ErrorFormat } from "./app-error.js";


export const TEMPLATE_ERRORS = {
    NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "TEMPLATE_NOT_FOUND",
            message: "La plantilla solicitada no existe o no tenés acceso a ella."
        }
    },
    NAME_OR_STRUCTURE_CONFLICT: {
        statusCode: 400,
        response: {
            code: "TEMPLATE_CONFLICT",
            message: "Ya existe una plantilla con ese nombre, o hay sort_order/column_order repetidos dentro de la plantilla."
        }
    },
    INVALID_BUILTIN_FIELD: {
        statusCode: 400,
        response: {
            code: "TEMPLATE_INVALID_BUILTIN_FIELD",
            message: "Una de las columnas usa un builtin_field que no existe en el catálogo."
        }
    },
    // Mismo criterio que PROJECT_ROLE_NOT_FOUND (project-roles.errors.ts):
    // "no existe" y "no la podés editar" se devuelven como el mismo 404
    // a propósito — no le decimos a un usuario si una plantilla de OTRO
    // usuario existe o no. Cubre tres casos: no existe, es del sistema
    // (is_system=true, nunca editable por este camino), o es de otro
    // usuario.
    NOT_EDITABLE: {
        statusCode: 404,
        response: {
            code: "TEMPLATE_NOT_FOUND_OR_NOT_EDITABLE",
            message: "La plantilla no existe, es una plantilla del sistema, o no tenés permiso para editarla."
        }
    },
    COLUMN_NOT_FOUND: {
        statusCode: 404,
        response: {
            code: "TEMPLATE_COLUMN_NOT_FOUND",
            message: "La columna solicitada no existe en esta plantilla."
        }
    }
} satisfies Record<string, ErrorFormat>;
