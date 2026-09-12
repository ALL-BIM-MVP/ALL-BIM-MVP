import z from 'zod';

export const WarehouseIdParamSchema = z.object({
    projectId: z.coerce.number(),
    warehouseId: z.coerce.number(),
});
export type WarehouseIdParam = z.infer<typeof WarehouseIdParamSchema>;

// Esquinas como número real (metros) — 2 puntos definen el rectángulo,
// nunca ancho/profundidad como campos aparte (ver diseño 1.2, quedarían
// redundantes con las esquinas). Mismo shape que usa rack.schema.ts
// para SUS propias esquinas — se repite a propósito en cada archivo en
// vez de compartir un solo objeto: son 4 campos, cada entidad las usa a
// su manera (warehouse valida área > 0, rack además valida que caigan
// justo en la grilla de cubos).
const CornersSchema = z.object({
    corner1_x: z.coerce.number(),
    corner1_z: z.coerce.number(),
    corner2_x: z.coerce.number(),
    corner2_z: z.coerce.number(),
});

export const CreateWarehouseBodySchema = CornersSchema.extend({
    name: z.string().trim().min(1, "El nombre no puede estar vacío"),
    warehouse_style_id: z.coerce.number(),
    direction: z.enum(["norte", "sur", "este", "oeste"]),
    // Espacio interior utilizable — INDEPENDIENTE del footprint de
    // arriba a propósito (ver diseño 1.2, confirmado explícito por el
    // usuario: "una casa chica por fuera puede tener mucho espacio
    // adentro").
    grid_width: z.coerce.number().int().positive(),
    grid_depth: z.coerce.number().int().positive(),
});
export type CreateWarehouseBody = z.infer<typeof CreateWarehouseBodySchema>;

// PUT reemplaza todos los campos editables de una — no es un PATCH
// parcial (mismo criterio que IfcClassificationConfigBodySchema).
export const UpdateWarehouseBodySchema = CreateWarehouseBodySchema;
export type UpdateWarehouseBody = z.infer<typeof UpdateWarehouseBodySchema>;
