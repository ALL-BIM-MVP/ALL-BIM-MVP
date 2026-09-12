import z from 'zod';

export const GoodsIssueIdParamSchema = z.object({
    projectId: z.coerce.number(),
    goodsIssueId: z.coerce.number(),
});
export type GoodsIssueIdParam = z.infer<typeof GoodsIssueIdParamSchema>;

const EPS = 1e-6;

// Mismo shape que GoodsReceiptItemLocationInputSchema/
// GoodsReceiptItemInputSchema en goods-receipt.schema.ts — se repite a
// propósito en vez de compartirse (mismo criterio que CornersSchema en
// warehouse.schema.ts/rack.schema.ts).
const GoodsIssueItemLocationInputSchema = z.object({
    bin_id: z.coerce.number(),
    quantity: z.coerce.number().positive(),
});

const GoodsIssueItemInputSchema = z.object({
    product_id: z.coerce.number(),
    total_quantity: z.coerce.number().positive(),
    locations: z.array(GoodsIssueItemLocationInputSchema).min(1, "Cada ítem necesita al menos una ubicación."),
}).refine(
    (item) => Math.abs(item.locations.reduce((sum, l) => sum + l.quantity, 0) - item.total_quantity) < EPS,
    { message: "La suma de las cantidades por ubicación tiene que ser igual a total_quantity.", path: ["locations"] }
);

export const CreateGoodsIssueBodySchema = z.object({
    // Campos reales del Vale de Salida (diseño 4.4) — destino en obra +
    // quién retira, no un "motivo" genérico.
    destination_sector: z.string().trim().min(1, "El sector de destino no puede estar vacío"),
    destination_level: z.string().trim().min(1, "El nivel de destino no puede estar vacío"),
    destination_block: z.string().trim().min(1, "El bloque de destino no puede estar vacío"),
    recipient_name: z.string().trim().min(1, "El nombre de quien retira no puede estar vacío"),
    recipient_dni: z.string().trim().min(1, "El DNI de quien retira no puede estar vacío"),
    issue_date: z.coerce.date(),
    items: z.array(GoodsIssueItemInputSchema).min(1, "Un vale de salida necesita al menos un ítem."),
});
export type CreateGoodsIssueBody = z.infer<typeof CreateGoodsIssueBodySchema>;
