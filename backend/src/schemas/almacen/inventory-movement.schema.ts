import z from 'zod';

// Kardex filtrable por producto/fecha (diseño 4.6/roadmap Fase 4) — los
// 3 filtros son independientes y opcionales.
export const ListInventoryMovementsQuerySchema = z.object({
    product_id: z.coerce.number().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
});
export type ListInventoryMovementsQuery = z.infer<typeof ListInventoryMovementsQuerySchema>;
