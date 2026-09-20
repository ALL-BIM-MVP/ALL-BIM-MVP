import z from 'zod';
import { dateOnlySchema } from './goods-receipt.schema.js';
import { idSchema } from './document-common.schema.js';

export const ProductHistoryParamSchema = z.object({
    projectId: z.coerce.number(),
    productId: z.coerce.number(),
});
export type ProductHistoryParam = z.infer<typeof ProductHistoryParamSchema>;

// bin_id filtra la historia a una casilla; from/to son fechas AAAA-MM-DD inclusivas
// (mismo criterio que el Kardex: se comparan con la fecha del documento).
export const ProductHistoryQuerySchema = z.object({
    bin_id: idSchema.optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
});
export type ProductHistoryQuery = z.infer<typeof ProductHistoryQuerySchema>;
