import z from 'zod';
import { dateOnlySchema } from './goods-receipt.schema.js';

// Kardex filtrable por producto/fecha (diseño 4.6/roadmap Fase 4) — los
// 3 filtros son independientes y opcionales.
export const ListInventoryMovementsQuerySchema = z.object({
    product_id: z.coerce.number().optional(),
    // Fechas "solo día" (AAAA-MM-DD), inclusivas: se comparan contra la
    // fecha del documento, sin depender de la zona horaria del servidor.
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
});
export type ListInventoryMovementsQuery = z.infer<typeof ListInventoryMovementsQuerySchema>;
