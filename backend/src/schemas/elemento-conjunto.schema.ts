import z from 'zod';

// PUT /projects/:projectId/elemento-conjunto-config — reemplaza TODA
// la lista de campos (no es un PATCH parcial), igual criterio que
// ifc-classification.schema.ts. Selección totalmente libre: no hay
// ningún campo obligatorio por defecto, salvo el mínimo de 2 (ver
// ELEMENTO_CONJUNTO_ERRORS.FIELDS_MIN_TWO — acá se valida con
// `.min(2)`, el service usa el error tipado para el 400 real).
const BuiltinElementoConjuntoFieldSchema = z.object({
    field_type: z.literal("builtin"),
    builtin_field: z.enum(["file_name", "global_id", "tag", "partida_code"]),
});

const PropertyElementoConjuntoFieldSchema = z.object({
    field_type: z.literal("property"),
    // property_set OPCIONAL a propósito — mismo criterio que
    // clasificación manual (Fase 4): sin set, el reporte busca la
    // propiedad en cualquier Pset del elemento.
    property_set: z.string().trim().max(255).optional(),
    property_name: z.string().trim().min(1).max(255),
});

export const ElementoConjuntoFieldInputSchema = z.discriminatedUnion("field_type", [
    BuiltinElementoConjuntoFieldSchema,
    PropertyElementoConjuntoFieldSchema,
]);

export type ElementoConjuntoFieldInput = z.infer<typeof ElementoConjuntoFieldInputSchema>;

const fieldIdentity = (field: ElementoConjuntoFieldInput): string =>
    field.field_type === "builtin"
        ? `builtin::${field.builtin_field}`
        : `property::${field.property_set ?? ""}::${field.property_name}`;

export const ElementoConjuntoConfigBodySchema = z.object({
    fields: z.array(ElementoConjuntoFieldInputSchema).min(2, "La clave necesita al menos 2 campos."),
}).refine(
    (body) => new Set(body.fields.map(fieldIdentity)).size === body.fields.length,
    { message: "Hay campos repetidos en la lista.", path: ["fields"] }
);

export type ElementoConjuntoConfigBody = z.infer<typeof ElementoConjuntoConfigBodySchema>;
