import z from 'zod';

export const AlmacenIdParamSchema = z.object({
    projectId: z.coerce.number(),
    almacenId: z.coerce.number(),
});
export type AlmacenIdParam = z.infer<typeof AlmacenIdParamSchema>;

// Esquinas como número real (metros) — 2 puntos definen el rectángulo,
// nunca ancho/profundidad como campos aparte (ver diseño 1.2, quedarían
// redundantes con las esquinas). Mismo shape que usa estante.schema.ts
// para SUS propias esquinas — se repite a propósito en cada archivo en
// vez de compartir un solo objeto: son 4 campos, cada entidad las usa a
// su manera (almacén valida área > 0, estante además valida que caigan
// justo en la grilla de cubos).
const EsquinasSchema = z.object({
    esquina1_x: z.coerce.number(),
    esquina1_z: z.coerce.number(),
    esquina2_x: z.coerce.number(),
    esquina2_z: z.coerce.number(),
});

export const CreateAlmacenBodySchema = EsquinasSchema.extend({
    nombre: z.string().trim().min(1, "El nombre no puede estar vacío"),
    almacen_estilo_id: z.coerce.number(),
    direccion: z.enum(["norte", "sur", "este", "oeste"]),
    // Espacio interior utilizable — INDEPENDIENTE del footprint de
    // arriba a propósito (ver diseño 1.2, confirmado explícito por el
    // usuario: "una casa chica por fuera puede tener mucho espacio
    // adentro").
    grid_ancho: z.coerce.number().int().positive(),
    grid_profundo: z.coerce.number().int().positive(),
});
export type CreateAlmacenBody = z.infer<typeof CreateAlmacenBodySchema>;

// PUT reemplaza todos los campos editables de una — no es un PATCH
// parcial (mismo criterio que IfcClassificationConfigBodySchema).
export const UpdateAlmacenBodySchema = CreateAlmacenBodySchema;
export type UpdateAlmacenBody = z.infer<typeof UpdateAlmacenBodySchema>;
