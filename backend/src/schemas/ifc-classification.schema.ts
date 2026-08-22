import z from 'zod';

// PUT /projects/:projectId/ifc-classification-config — reemplaza TODA
// la config del proyecto (mode + property_prefix + locked + el único
// slot=1 soportado hoy, ver ifc_classification_config_fields en el
// schema). mode='norma' no necesita nada más (vuelve al comportamiento
// de siempre) — mode='manual' exige al menos property_prefix +
// code_property_name, el resto es opcional (cae a los mismos fallbacks
// que ya existían: nombre del elemento IFC / inferir_unidad).
export const IfcClassificationConfigBodySchema = z.object({
    mode: z.enum(["norma", "manual"]),
    property_prefix: z.string().trim().min(1).max(60).optional(),
    locked: z.boolean().optional(),
    code_property_set: z.string().trim().max(255).optional(),
    code_property_name: z.string().trim().min(1).max(255).optional(),
    description_property_set: z.string().trim().max(255).optional(),
    description_property_name: z.string().trim().max(255).optional(),
    unit_property_set: z.string().trim().max(255).optional(),
    unit_property_name: z.string().trim().max(255).optional(),
}).refine(
    (body) => body.mode !== "manual" || !!body.property_prefix,
    { message: "mode='manual' requiere property_prefix.", path: ["property_prefix"] }
).refine(
    (body) => body.mode !== "manual" || !!body.code_property_name,
    { message: "mode='manual' requiere code_property_name.", path: ["code_property_name"] }
);

export type IfcClassificationConfigBody = z.infer<typeof IfcClassificationConfigBodySchema>;

// Override puntual al procesar UN archivo (ver ProcessIfcMetradosBodySchema
// en ifc-metrados.schema.ts) — equivalente a la opción "Manual" que
// elige el usuario en vez de "Default" (usar la config del proyecto tal
// cual). Rechazado con 409 si la config del proyecto está locked=true
// (ver ifc-classification.errors.ts). Mismos campos que la config de
// proyecto salvo `mode`/`locked` — un override SIEMPRE es manual, no
// tiene sentido "override a norma" (para eso simplemente no se manda
// override y se usa el default del proyecto).
const ClassificationOverrideSchema = z.object({
    property_prefix: z.string().trim().min(1).max(60),
    code_property_set: z.string().trim().max(255).optional(),
    code_property_name: z.string().trim().min(1).max(255),
    description_property_set: z.string().trim().max(255).optional(),
    description_property_name: z.string().trim().max(255).optional(),
    unit_property_set: z.string().trim().max(255).optional(),
    unit_property_name: z.string().trim().max(255).optional(),
});

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
