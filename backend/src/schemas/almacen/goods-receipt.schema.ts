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

export const CreateGoodsReceiptBodySchema = z.object({
    // 4 datos de compra (diseño 4.1) — separados, no un solo campo de texto libre.
    supplier_ruc: z.string().trim().min(1, "El RUC no puede estar vacío"),
    supplier_name: z.string().trim().min(1, "El proveedor no puede estar vacío"),
    delivery_note_number: z.string().trim().min(1, "El número de guía no puede estar vacío"),
    purchase_date: z.coerce.date(),
    items: z.array(GoodsReceiptItemInputSchema).min(1, "Un ingreso necesita al menos un ítem."),
});
export type CreateGoodsReceiptBody = z.infer<typeof CreateGoodsReceiptBodySchema>;
