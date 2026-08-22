import z from 'zod';
import { optionalBooleanFlag } from './file.schema.js';
import { TemplateColumnInputSchema } from './templates.schema.js';
import { ClassificationOverrideFieldSchema } from './ifc-classification.schema.js';

export const IfcFileIdParamSchema = z.object({
    ifcFileId: z.coerce.number(),
});

export type IfcFileIdParam = z.infer<typeof IfcFileIdParamSchema>;

// Variante JSON de POST /:projectId/ifc-metrados/process — "archivo ya
// guardado" (en vez de multipart con un archivo nuevo). Si vino un
// archivo por multipart, este body no se usa (el controller decide).
//
// replaces_ifc_document_id/specialty_id/document_name (Fase 3, ver
// docs/roadmap-modulos-y-permisos.md) SOLO importan cuando el
// procesamiento va a crear una fila ifc_files nueva (primera vez que
// se procesa este file_id) — si ya existe (reproceso/force), el
// service los ignora, la versión/documento de esa fila ya está fijada.
// multer también deja los campos de texto de un multipart en req.body,
// así este mismo schema sirve para las dos variantes del endpoint.
//
// - replaces_ifc_document_id: sube esta versión como una nueva versión
//   de un ifc_documents YA existente (el flujo "reemplazar" del
//   frontend) — no se manda specialty_id junto (la especialidad es del
//   documento, no de la versión).
// - specialty_id: obligatorio cuando NO viene replaces_ifc_document_id
//   — crea un ifc_documents nuevo (documento de primera versión). Se
//   valida en el service (existe + is_active), no acá.
// - document_name: nombre del ifc_documents nuevo; si no viene, el
//   service usa el nombre del archivo subido.
// classification_override (Fase 4, ver docs/roadmap-modulos-y-permisos.md)
// — DOS partes independientes: "mode" (pisa cómo se clasifica esta
// subida puntual, requiere code_property_name) y "property_prefix"
// (pisa qué propiedades se capturan, independiente de mode) — se puede
// mandar una, la otra, las dos, o ninguna. Sin esto, se usa siempre el
// default del proyecto para cada parte. Rechazado con 409
// MODE_LOCKED/PREFIX_LOCKED si esa parte puntual está bloqueada en la
// config del proyecto (cada una tiene su propio candado, no uno grupal).
export const ProcessIfcMetradosBodySchema = z.object({
    file_id: z.coerce.number().optional(),
    replaces_ifc_document_id: z.coerce.number().optional(),
    specialty_id: z.coerce.number().optional(),
    document_name: z.string().trim().min(1).max(150).optional(),
    classification_override: ClassificationOverrideFieldSchema,
}).refine(
    (body) => !(body.replaces_ifc_document_id !== undefined && body.specialty_id !== undefined),
    { message: "No se puede mandar replaces_ifc_document_id y specialty_id al mismo tiempo — la especialidad es del documento, no de la versión.", path: ["specialty_id"] }
);

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
