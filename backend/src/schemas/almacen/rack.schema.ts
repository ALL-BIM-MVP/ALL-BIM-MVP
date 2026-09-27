import z from 'zod';
import { WarehouseIdParamSchema } from './warehouse.schema.js';

export const RackIdParamSchema = WarehouseIdParamSchema.extend({
    rackId: z.coerce.number(),
});
export type RackIdParam = z.infer<typeof RackIdParamSchema>;

// A diferencia de CornersSchema de warehouse.schema.ts (esquinas en metros, un
// footprint real), acá son índices ENTEROS de la grilla interior del warehouse —
// nunca metros, nunca depende de ninguna constante de tamaño de cubo.
const CornersSchema = z.object({
    corner1_x: z.coerce.number().int(),
    corner1_z: z.coerce.number().int(),
    corner2_x: z.coerce.number().int(),
    corner2_z: z.coerce.number().int(),
});

export const CreateRackBodySchema = CornersSchema.extend({
    // .max(100) espeja racks.name VARCHAR(100) en schema.sql.
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(100),
    // Cuántas bahías tiene (a lo largo del eje X local) — dato directo, igual de
    // directo que `levels`: ya no se deriva de las esquinas ni de ninguna constante.
    bays: z.coerce.number().int().positive(),
    // 1 (una cara) o 2 (doble cara) — dato directo, ya no se deriva.
    depth: z.union([z.literal(1), z.literal(2)]),
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
