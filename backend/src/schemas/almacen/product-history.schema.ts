import z from 'zod';
import { dateOnlySchema } from './goods-receipt.schema.js';
import { idSchema } from './document-common.schema.js';

export const ProductHistoryParamSchema = z.object({
    projectId: z.coerce.number(),
    productId: z.coerce.number(),
});
export type ProductHistoryParam = z.infer<typeof ProductHistoryParamSchema>;

// Filtros y orden comunes de las hojas de vida (producto y ubicación):
//  - from/to: fechas AAAA-MM-DD inclusivas (fecha del documento, como el Kardex).
//  - type: solo entradas, solo salidas o todo.
//  - sort: `date` mezcla todo por fecha; `entrada_first` / `salida_first` agrupa un tipo primero
//    (dentro de cada grupo, por fecha).
//  - direction: sentido de la fecha (desc = más reciente primero).
export const historyFilterFields = {
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    type: z.enum(["all", "entrada", "salida"]).default("all"),
    sort: z.enum(["date", "entrada_first", "salida_first"]).default("date"),
    direction: z.enum(["asc", "desc"]).default("desc"),
};

// bin_id filtra a una casilla. include_in_progress=false oculta las entradas "en curso" (sin guía).
export const ProductHistoryQuerySchema = z.object({
    ...historyFilterFields,
    bin_id: idSchema.optional(),
    include_in_progress: z.enum(["true", "false"]).default("true").transform((v) => v === "true"),
});
export type ProductHistoryQuery = z.infer<typeof ProductHistoryQuerySchema>;
