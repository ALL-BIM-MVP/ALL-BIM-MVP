import z from 'zod';
import { optionalBooleanFlag } from './file.schema.js';

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

// Por ahora no hay sistema de plantillas (metrado_templates) armado —
// el detalle de una partida siempre usa el set fijo de columnas de
// metrado_elements, agrupado por estos 3 campos por defecto. Si el
// cliente manda template_id/columns igual (adelantándose a cuando sí
// exista), Zod los descarta en silencio en vez de fallar el request —
// no rompe nada cuando se implemente de verdad.
export const GROUP_BY_FIELDS = ["level_name", "space_name", "tag"] as const;
export type GroupByField = (typeof GROUP_BY_FIELDS)[number];

export const PartidaElementsBodySchema = z.object({
    group_by: z.array(z.enum(GROUP_BY_FIELDS)).optional(),
});

export type PartidaElementsBody = z.infer<typeof PartidaElementsBodySchema>;
