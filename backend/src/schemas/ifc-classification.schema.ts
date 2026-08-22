import z from 'zod';

// PUT /projects/:projectId/ifc-classification-config — reemplaza TODA
// la config del proyecto (no es un PATCH parcial). mode y
// property_prefix son dos preguntas independientes (ver
// docs/roadmap-modulos-y-permisos.md, Fase 4) — property_prefix es
// válido (y opcional) en CUALQUIER mode, no solo 'manual'. Cada uno
// tiene su propio *_locked, no hay un "locked" grupal.
export const IfcClassificationConfigBodySchema = z.object({
    mode: z.enum(["norma", "manual"]),
    mode_locked: z.boolean().optional(),
    property_prefix: z.string().trim().max(60).optional(),
    property_prefix_locked: z.boolean().optional(),
    code_property_set: z.string().trim().max(255).optional(),
    code_property_name: z.string().trim().min(1).max(255).optional(),
    description_property_set: z.string().trim().max(255).optional(),
    description_property_name: z.string().trim().max(255).optional(),
    unit_property_set: z.string().trim().max(255).optional(),
    unit_property_name: z.string().trim().max(255).optional(),
}).refine(
    (body) => body.mode !== "manual" || !!body.code_property_name,
    { message: "mode='manual' requiere code_property_name.", path: ["code_property_name"] }
);

export type IfcClassificationConfigBody = z.infer<typeof IfcClassificationConfigBodySchema>;

// Override puntual al procesar UN archivo (ver ProcessIfcMetradosBodySchema
// en ifc-metrados.schema.ts) — DOS partes independientes, cualquiera de
// las dos (o las dos juntas) se puede mandar en el mismo request:
//   - mode: "manual" — pisa el modo de clasificación para esta subida
//     puntual (requiere code_property_name). Rechazado con 409 si
//     mode_locked=true en la config del proyecto.
//   - property_prefix — pisa el prefijo para esta subida puntual,
//     independiente de si también se pisó el modo. Rechazado con 409
//     si property_prefix_locked=true. "" es un valor válido (= sin
//     filtro para esta subida).
const ClassificationOverrideSchema = z.object({
    mode: z.literal("manual").optional(),
    code_property_set: z.string().trim().max(255).optional(),
    code_property_name: z.string().trim().min(1).max(255).optional(),
    description_property_set: z.string().trim().max(255).optional(),
    description_property_name: z.string().trim().max(255).optional(),
    unit_property_set: z.string().trim().max(255).optional(),
    unit_property_name: z.string().trim().max(255).optional(),
    property_prefix: z.string().trim().max(60).optional(),
}).refine(
    (body) => body.mode !== "manual" || !!body.code_property_name,
    { message: "mode='manual' en el override requiere code_property_name.", path: ["code_property_name"] }
);

export type ClassificationOverride = z.infer<typeof ClassificationOverrideSchema>;

// multer deja los campos de texto de un multipart como STRING siempre
// — así que classification_override viaja como un JSON.stringify(...)
// en esa variante, pero como objeto real en la variante JSON del
// endpoint (Content-Type: application/json). Este schema acepta las
// dos formas.
export const ClassificationOverrideFieldSchema = z.union([
    z.string().transform((val, ctx) => {
        try {
            return JSON.parse(val) as unknown;
        } catch {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "classification_override debe ser JSON válido." });
            return z.NEVER;
        }
    }).pipe(ClassificationOverrideSchema),
    ClassificationOverrideSchema,
]).optional();
