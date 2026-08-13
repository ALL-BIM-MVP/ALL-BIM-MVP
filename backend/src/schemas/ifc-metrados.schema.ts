import z from 'zod';
import { optionalBooleanFlag } from './file.schema.js';
import { TemplateColumnInputSchema } from './templates.schema.js';

export const IfcFileIdParamSchema = z.object({
    ifcFileId: z.coerce.number(),
});

export type IfcFileIdParam = z.infer<typeof IfcFileIdParamSchema>;

// Variante JSON de POST /:projectId/ifc-metrados/process — "archivo ya
// guardado" (en vez de multipart con un archivo nuevo). Si vino un
// archivo por multipart, este body no se usa (el controller decide).
export const ProcessIfcMetradosBodySchema = z.object({
    file_id: z.coerce.number().optional(),
});

export type ProcessIfcMetradosBody = z.infer<typeof ProcessIfcMetradosBodySchema>;

export const ProcessIfcMetradosQuerySchema = z.object({
    force: optionalBooleanFlag,
});

export type ProcessIfcMetradosQuery = z.infer<typeof ProcessIfcMetradosQuerySchema>;

export const PartidaIdParamSchema = IfcFileIdParamSchema.extend({
    partidaId: z.coerce.number(),
});

export type PartidaIdParam = z.infer<typeof PartidaIdParamSchema>;

export const GROUP_BY_FIELDS = ["level_name", "space_name", "tag"] as const;
export type GroupByField = (typeof GROUP_BY_FIELDS)[number];

// template_id y columns son mutuamente excluyentes — los dos apuntan a
// "qué columnas de propiedad IFC hay que resolver", uno por referencia
// (una plantilla ya guardada) y el otro inline (la "plantilla en
// ejecución" que el frontend arma en memoria sin guardar todavía). Las
// columnas "builtin" de cualquiera de los dos NO necesitan resolución:
// ya son exactamente los campos fijos que este endpoint siempre
// devuelve (ver metrado-partidas.models.ts) — lo único que hay que
// resolver de verdad son las "ifc_property" (ver
// metrado-partidas.service.ts, resolvePropertyRefs/resolvePropertyValues).
export const PartidaElementsBodySchema = z.object({
    group_by: z.array(z.enum(GROUP_BY_FIELDS)).optional(),
    template_id: z.coerce.number().optional(),
    columns: z.array(TemplateColumnInputSchema).optional(),
}).refine(
    (body) => !(body.template_id !== undefined && body.columns !== undefined),
    { message: "No se puede mandar template_id y columns al mismo tiempo — elegí uno.", path: ["columns"] }
);

export type PartidaElementsBody = z.infer<typeof PartidaElementsBodySchema>;
