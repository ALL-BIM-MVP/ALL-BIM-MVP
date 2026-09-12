import z from 'zod';
import { EstanteIdParamSchema } from './estante.schema.js';

export const CasillaIdParamSchema = EstanteIdParamSchema.extend({
    casillaId: z.coerce.number(),
});
export type CasillaIdParam = z.infer<typeof CasillaIdParamSchema>;

export const UpdateCasillaBodySchema = z.object({
    nombre: z.string().trim().min(1, "El nombre no puede estar vacío"),
});
export type UpdateCasillaBody = z.infer<typeof UpdateCasillaBodySchema>;
