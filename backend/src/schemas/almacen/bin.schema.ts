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

export const BinContentIdParamSchema = BinIdParamSchema.extend({
    binContentId: z.coerce.number(),
});
export type BinContentIdParam = z.infer<typeof BinContentIdParamSchema>;

// Ajuste fino de CÓMO SE VE un contenido dentro de su casilla (nunca cuánto hay: eso
// solo lo cambian ingreso/vale/ajuste, ver inventory-movement.service.ts). Ningún campo
// obligatorio individualmente, pero hace falta mandar al menos uno. rotation_x/y/z en
// RADIANES (misma unidad que ya usa three.js en el frontend, evita una conversión más
// — mismo criterio que se usó para sacar CUBE_SIZE del backend).
export const UpdateBinContentPoseBodySchema = z.object({
    position_x: z.coerce.number().optional(),
    position_y: z.coerce.number().optional(),
    position_z: z.coerce.number().optional(),
    rotation_x: z.coerce.number().optional(),
    rotation_y: z.coerce.number().optional(),
    rotation_z: z.coerce.number().optional(),
    scale: z.coerce.number().positive().optional(),
}).strict().refine((b) => Object.keys(b).length > 0, { message: "Debe enviarse al menos un campo para modificar." });
export type UpdateBinContentPoseBody = z.infer<typeof UpdateBinContentPoseBodySchema>;
