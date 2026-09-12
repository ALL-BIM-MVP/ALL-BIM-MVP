import z from 'zod';
import { AlmacenIdParamSchema } from './almacen.schema.js';

export const EstanteIdParamSchema = AlmacenIdParamSchema.extend({
    estanteId: z.coerce.number(),
});
export type EstanteIdParam = z.infer<typeof EstanteIdParamSchema>;

// Mismo shape que EsquinasSchema de almacen.schema.ts — ver el
// comentario ahí de por qué se repite en vez de compartirse.
const EsquinasSchema = z.object({
    esquina1_x: z.coerce.number(),
    esquina1_z: z.coerce.number(),
    esquina2_x: z.coerce.number(),
    esquina2_z: z.coerce.number(),
});

export const CreateEstanteBodySchema = EsquinasSchema.extend({
    nombre: z.string().trim().min(1, "El nombre no puede estar vacío"),
    niveles: z.coerce.number().int().positive(),
    // 0 | 1 — cuál de las 2 caras es la accesible (ver diseño 1.3): el
    // nombre visible de cada valor es decisión del frontend, acá solo
    // viaja el índice.
    direccion: z.union([z.literal(0), z.literal(1)]),
});
export type CreateEstanteBody = z.infer<typeof CreateEstanteBodySchema>;

// Único campo editable de un estante ya creado — el resto (esquinas,
// niveles, dirección) implicaría regenerar sus casillas desde cero
// (con posible pérdida de contenido/nombres editados), fuera de
// alcance de esta fase. Para "reubicar" un estante hoy: darlo de baja
// y crear uno nuevo.
export const UpdateEstanteBodySchema = z.object({
    nombre: z.string().trim().min(1, "El nombre no puede estar vacío"),
});
export type UpdateEstanteBody = z.infer<typeof UpdateEstanteBodySchema>;
