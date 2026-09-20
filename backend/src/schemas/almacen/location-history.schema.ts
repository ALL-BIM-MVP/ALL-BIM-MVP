import z from 'zod';
import { historyFilterFields } from './product-history.schema.js';
import { idSchema } from './document-common.schema.js';

// Hoja de vida de una ubicación (estante o casilla): mismos filtros y orden que la del producto
// (fechas, tipo, sort, direction) más `product_id` para ver un solo producto.
export const LocationHistoryQuerySchema = z.object({
    ...historyFilterFields,
    product_id: idSchema.optional(),
});
export type LocationHistoryQuery = z.infer<typeof LocationHistoryQuerySchema>;
