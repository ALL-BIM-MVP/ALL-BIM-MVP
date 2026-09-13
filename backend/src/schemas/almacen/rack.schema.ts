import z from 'zod';
import { WarehouseIdParamSchema } from './warehouse.schema.js';

export const RackIdParamSchema = WarehouseIdParamSchema.extend({
    rackId: z.coerce.number(),
});
export type RackIdParam = z.infer<typeof RackIdParamSchema>;

// Mismo shape que CornersSchema de warehouse.schema.ts — ver el
// comentario ahí de por qué se repite en vez de compartirse.
const CornersSchema = z.object({
    corner1_x: z.coerce.number(),
    corner1_z: z.coerce.number(),
    corner2_x: z.coerce.number(),
    corner2_z: z.coerce.number(),
});

export const CreateRackBodySchema = CornersSchema.extend({
    // .max(100) espeja racks.name VARCHAR(100) en schema.sql.
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(100),
    levels: z.coerce.number().int().positive(),
    // 0 | 1 — cuál de las 2 caras es la accesible (ver diseño 1.3): el
    // nombre visible de cada valor es decisión del frontend, acá solo
    // viaja el índice.
    direction: z.union([z.literal(0), z.literal(1)]),
});
export type CreateRackBody = z.infer<typeof CreateRackBodySchema>;

// Único campo editable de un rack ya creado — el resto (esquinas,
// niveles, dirección) implicaría regenerar sus bins desde cero (con
// posible pérdida de contenido/nombres editados), fuera de alcance de
// esta fase. Para "reubicar" un rack hoy: darlo de baja y crear uno
// nuevo.
export const UpdateRackBodySchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(100),
});
export type UpdateRackBody = z.infer<typeof UpdateRackBodySchema>;
