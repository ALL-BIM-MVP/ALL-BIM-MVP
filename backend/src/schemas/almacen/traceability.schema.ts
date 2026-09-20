import z from 'zod';

export const TraceabilityParamSchema = z.object({
    projectId: z.coerce.number(),
    documentType: z.enum(["requisition", "quotation", "purchase-order", "invoice", "goods-receipt"]),
    documentId: z.coerce.number(),
});
export type TraceabilityParam = z.infer<typeof TraceabilityParamSchema>;

// Por defecto `all`: el conjunto completo conectado con el documento.
export const TraceabilityQuerySchema = z.object({
    direction: z.enum(["backward", "forward", "all"]).default("all"),
});
export type TraceabilityQuery = z.infer<typeof TraceabilityQuerySchema>;
