import z from 'zod';

export const TemplateIdParamSchema = z.object({
    templateId: z.coerce.number(),
});

export type TemplateIdParam = z.infer<typeof TemplateIdParamSchema>;

const BuiltinColumnInputSchema = z.object({
    name: z.string().min(1),
    source_type: z.literal("builtin"),
    builtin_field: z.string().min(1),
    column_order: z.coerce.number(),
    is_visible: z.boolean().optional(),
});

const IfcPropertyColumnInputSchema = z.object({
    name: z.string().min(1),
    source_type: z.literal("ifc_property"),
    // property_set_name puede ser "" (string vacío) a propósito — es un
    // caso real, no inválido: pasa cuando el IFC tiene la propiedad
    // suelta, sin agruparla bajo ningún Pset (ver GET
    // /ifc-files/:id/available-columns). El CHECK de la tabla real
    // (metrado_template_columns) solo exige NOT NULL, no longitud
    // mínima — este schema tiene que espejar exactamente eso, si no
    // hay propiedades legítimas que nunca se pueden referenciar en
    // ninguna plantilla.
    property_set_name: z.string(),
    property_name: z.string().min(1),
    column_order: z.coerce.number(),
    is_visible: z.boolean().optional(),
});

// Espeja el CHECK de metrado_template_columns: 'builtin' trae
// builtin_field (y nada de property_*), 'ifc_property' trae
// property_set_name + property_name (y nada de builtin_field).
export const TemplateColumnInputSchema = z.discriminatedUnion("source_type", [
    BuiltinColumnInputSchema,
    IfcPropertyColumnInputSchema,
]);

export type TemplateColumnInput = z.infer<typeof TemplateColumnInputSchema>;

export const TemplateSetInputSchema = z.object({
    name: z.string().min(1),
    sort_order: z.coerce.number(),
    columns: z.array(TemplateColumnInputSchema).min(1, "Cada set necesita al menos una columna."),
});

export type TemplateSetInput = z.infer<typeof TemplateSetInputSchema>;

export const CreateTemplateBodySchema = z.object({
    name: z.string().min(1, "El nombre no puede estar vacío"),
    description: z.string().nullable().optional(),
    sets: z.array(TemplateSetInputSchema).min(1, "La plantilla necesita al menos un set de columnas."),
});

export type CreateTemplateBody = z.infer<typeof CreateTemplateBodySchema>;

// PUT /:templateId/columns reemplaza toda la estructura de sets+columnas
// de una plantilla ya existente — mismo shape que "sets" en el create,
// no se puede tocar name/description/is_default desde acá.
export const UpdateTemplateColumnsBodySchema = z.object({
    sets: z.array(TemplateSetInputSchema).min(1, "La plantilla necesita al menos un set de columnas."),
});

export type UpdateTemplateColumnsBody = z.infer<typeof UpdateTemplateColumnsBodySchema>;

export const TemplateColumnIdParamSchema = z.object({
    templateId: z.coerce.number(),
    columnId: z.coerce.number(),
});

export type TemplateColumnIdParam = z.infer<typeof TemplateColumnIdParamSchema>;

export const ToggleColumnVisibilityBodySchema = z.object({
    is_visible: z.boolean(),
});

export type ToggleColumnVisibilityBody = z.infer<typeof ToggleColumnVisibilityBodySchema>;

// scope: "system" = solo las del sistema, "mine" = solo las propias,
// "all" (default) = ambas — mismo criterio de acceso que ya usa
// getTemplateByIdService (is_system OR created_by = quien pide).
export const ListTemplatesQuerySchema = z.object({
    scope: z.enum(["system", "mine", "all"]).optional(),
});

export type ListTemplatesQuery = z.infer<typeof ListTemplatesQuerySchema>;
