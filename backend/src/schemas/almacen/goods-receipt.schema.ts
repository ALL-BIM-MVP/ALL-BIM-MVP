import z from 'zod';

export const GoodsReceiptIdParamSchema = z.object({
    projectId: z.coerce.number(),
    goodsReceiptId: z.coerce.number(),
});
export type GoodsReceiptIdParam = z.infer<typeof GoodsReceiptIdParamSchema>;

const EPS = 1e-6;

const GoodsReceiptItemLocationInputSchema = z.object({
    bin_id: z.coerce.number(),
    quantity: z.coerce.number().positive(),
});

// La suma de las ubicaciones tiene que dar EXACTO total_quantity — la
// validación cruzada que pide el diseño 4.3, hecha acá antes de tocar
// la base (además de la RESTRICCIÓN de negocio ya documentada, esto es
// lo que la hace cumplir de verdad). Epsilon en vez de === estricto
// por precisión de punto flotante en decimales.
const GoodsReceiptItemInputSchema = z.object({
    product_id: z.coerce.number(),
    // Lo que se RECIBIÓ físicamente (suma al stock y se reparte entre ubicaciones).
    total_quantity: z.coerce.number().positive(),
    // Lo que decía la guía — opcional: puede diferir de lo recibido
    // (faltantes, mermas, roturas). No se valida contra total_quantity.
    quantity_per_delivery_note: z.coerce.number().positive().optional(),
    locations: z.array(GoodsReceiptItemLocationInputSchema).min(1, "Cada ítem necesita al menos una ubicación."),
}).refine(
    (item) => Math.abs(item.locations.reduce((sum, l) => sum + l.quantity, 0) - item.total_quantity) < EPS,
    { message: "La suma de las cantidades por ubicación tiene que ser igual a total_quantity.", path: ["locations"] }
);

// Guía de remisión: serie y número SEPARADOS, como vienen en el
// documento (formato real de SUNAT, ver el comentario en schema.sql). La
// serie se normaliza a mayúsculas; el número son 1 a 8 dígitos. Mismos
// CHECK que goods_receipts.delivery_note_series/number en schema.sql.
// Fecha "solo día" (columna DATE): llega y se guarda como texto
// "YYYY-MM-DD", sin pasar por un Date — así no depende de la zona horaria
// del servidor. Es lo que ya envía un <input type="date">. Exportada:
// goods-issue.schema.ts la reusa para la fecha del vale.
export const dateOnlySchema = z.iso.date("La fecha debe tener el formato AAAA-MM-DD");

const deliveryNoteSeriesSchema = z.string().trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{1,4}$/, "La serie de la guía debe tener de 1 a 4 letras o números, sin guiones ni espacios"));
const deliveryNoteNumberSchema = z.string().trim()
    .regex(/^\d{1,8}$/, "El número de la guía debe tener de 1 a 8 dígitos");

export const CreateGoodsReceiptBodySchema = z.object({
    // El proveedor se elige o se crea antes (GET/POST .../suppliers): acá
    // solo viaja su id. El RUC y el nombre viven en `suppliers`.
    supplier_id: z.coerce.number(),
    delivery_note_series: deliveryNoteSeriesSchema,
    delivery_note_number: deliveryNoteNumberSchema,
    // Fecha de emisión que dice la guía.
    delivery_note_date: dateOnlySchema,
    // Fecha en que el material llegó de verdad; si no viene, la base usa hoy.
    received_date: dateOnlySchema.optional(),
    items: z.array(GoodsReceiptItemInputSchema).min(1, "Un ingreso necesita al menos un ítem."),
});
export type CreateGoodsReceiptBody = z.infer<typeof CreateGoodsReceiptBodySchema>;
