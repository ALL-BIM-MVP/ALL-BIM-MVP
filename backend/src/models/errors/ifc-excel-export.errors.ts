import type { ErrorFormat } from "./app-error.js";


export const IFC_EXCEL_EXPORT_ERRORS = {
    IFC_NOT_PROCESSED: {
        statusCode: 409,
        response: {
            code: "IFC_NOT_PROCESSED",
            message: "Este archivo IFC todavía no terminó de procesarse (o falló) — no hay metrado para exportar."
        }
    }
} satisfies Record<string, ErrorFormat>;
