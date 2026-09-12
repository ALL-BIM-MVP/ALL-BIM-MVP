import z from 'zod';
import { RackIdParamSchema } from './rack.schema.js';

export const BinIdParamSchema = RackIdParamSchema.extend({
    binId: z.coerce.number(),
});
export type BinIdParam = z.infer<typeof BinIdParamSchema>;

export const UpdateBinBodySchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío"),
});
export type UpdateBinBody = z.infer<typeof UpdateBinBodySchema>;
