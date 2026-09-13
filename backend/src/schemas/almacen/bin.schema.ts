import z from 'zod';
import { RackIdParamSchema } from './rack.schema.js';

export const BinIdParamSchema = RackIdParamSchema.extend({
    binId: z.coerce.number(),
});
export type BinIdParam = z.infer<typeof BinIdParamSchema>;

export const UpdateBinBodySchema = z.object({
    // .max(100) espeja bins.name VARCHAR(100) en schema.sql.
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(100),
});
export type UpdateBinBody = z.infer<typeof UpdateBinBodySchema>;
