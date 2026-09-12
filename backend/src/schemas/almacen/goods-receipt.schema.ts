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
    total_quantity: z.coerce.number().positive(),
    locations: z.array(GoodsReceiptItemLocationInputSchema).min(1, "Cada ítem necesita al menos una ubicación."),
}).refine(
    (item) => Math.abs(item.locations.reduce((sum, l) => sum + l.quantity, 0) - item.total_quantity) < EPS,
    { message: "La suma de las cantidades por ubicación tiene que ser igual a total_quantity.", path: ["locations"] }
);

// RUC peruano (SUNAT): SIEMPRE 11 dígitos numéricos exactos, nunca
// letras/guiones/espacios propios del identificador — mismo CHECK que
// espeja goods_receipts.supplier_ruc en schema.sql (~ '^\d{11}$').
// `.replace` antes de validar es tolerancia de tipeo/copy-paste (un
// RUC copiado de una factura a veces trae espacios o un guion tipo
// "20-123456789"), NO relaja la regla: lo que llega a la base sigue
// siendo exactamente 11 dígitos limpios.
const RUC_REGEX = /^\d{11}$/;
export const supplierRucSchema = z.string().trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(RUC_REGEX, "El RUC debe tener exactamente 11 dígitos numéricos (formato SUNAT)"));

export const CreateGoodsReceiptBodySchema = z.object({
    // 4 datos de compra (diseño 4.1) — separados, no un solo campo de texto libre.
    supplier_ruc: supplierRucSchema,
    // Los .max() de acá abajo espejan los VARCHAR(n) reales de
    // schema.sql — sin esto, un texto más largo que la columna no lo
    // rechaza un 400 legible, lo rechaza Postgres con un error crudo
    // de "value too long for type character varying(n)".
    supplier_name: z.string().trim().min(1, "El proveedor no puede estar vacío").max(200),
    delivery_note_number: z.string().trim().min(1, "El número de guía no puede estar vacío").max(50),
    purchase_date: z.coerce.date(),
    items: z.array(GoodsReceiptItemInputSchema).min(1, "Un ingreso necesita al menos un ítem."),
});
export type CreateGoodsReceiptBody = z.infer<typeof CreateGoodsReceiptBodySchema>;
