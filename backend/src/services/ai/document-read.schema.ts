// Lo que la IA devuelve al leer un documento de compras (factura, guía, cotización, orden,
// requerimiento): datos CRUDOS tal como están en el papel, sin vínculos con nuestro sistema.
// Un solo esquema para los cinco tipos: lo que no aplica o no se ve va en null. Este mismo esquema
// se le exige al modelo (JSON Schema) y se vuelve a validar aquí (Zod): la salida de la IA se trata
// como entrada de usuario, nunca como confiable.
import z from 'zod';

const nullableText = z.string().nullable();
const nullableNumber = z.number().nullable();

const PartySchema = z.object({ ruc: nullableText, name: nullableText }).nullable();

export const DocumentReadItemSchema = z.object({
    // Código impreso en la línea (código de obra, código del proveedor…).
    code: nullableText,
    // ID o número de ítem impreso aparte del código (columna "ID" o "Item"), por ejemplo 00001.
    line_id: nullableText,
    description: z.string(),
    unit: nullableText,
    quantity: nullableNumber,
    unit_price: nullableNumber,
    line_total: nullableNumber,
    // Solo requerimientos: sección del papel a la que pertenece la línea.
    category: z.enum(["partida", "material", "equipo"]).nullable(),
});

export const DocumentReadSchema = z.object({
    detected_type: z.enum(["factura", "guia_remision", "cotizacion", "orden_compra", "requerimiento", "otro"]),
    // Proveedor (quien VENDE o entrega el material) y cliente (quien compra o recibe). No dependen de quién
    // emitió el papel: en una orden de compra, el proveedor es el destinatario ("Señor(es)").
    supplier: PartySchema,
    customer: PartySchema,
    series: nullableText,
    number: nullableText,
    date: nullableText,
    currency: z.enum(["PEN", "USD"]).nullable(),
    subtotal: nullableNumber,
    tax: nullableNumber,
    total: nullableNumber,
    valid_until: nullableText,
    commercial_terms: nullableText,
    requester: nullableText,
    // Número de otro documento citado (orden de compra del cliente, guía…).
    referenced_order: nullableText,
    items: z.array(DocumentReadItemSchema),
    // Dudas de lectura, en español (ilegible, manuscrito, borroso…).
    warnings: z.array(z.string()),
});
export type DocumentRead = z.infer<typeof DocumentReadSchema>;

// JSON Schema que se le pasa al modelo, derivado del mismo esquema (una sola fuente).
export const DOCUMENT_READ_JSON_SCHEMA = z.toJSONSchema(DocumentReadSchema, { target: "draft-2020-12" });
