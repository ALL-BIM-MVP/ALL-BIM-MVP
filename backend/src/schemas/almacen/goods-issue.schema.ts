import z from 'zod';
import { dateOnlySchema } from './goods-receipt.schema.js';
import { documentNumberSchema } from './document-common.schema.js';

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

// DNI peruano (RENIEC): SIEMPRE 8 dígitos numéricos exactos — mismo
// CHECK que espeja goods_issues.recipient_dni en schema.sql
// (~ '^\d{8}$'). Mismo criterio de tolerancia que supplierRucSchema en
// goods-receipt.schema.ts (no se comparte entre archivos a propósito,
// ver CornersSchema en warehouse.schema.ts/rack.schema.ts).
const DNI_REGEX = /^\d{8}$/;
const recipientDniSchema = z.string().trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(DNI_REGEX, "El DNI debe tener exactamente 8 dígitos numéricos"));

export const CreateGoodsIssueBodySchema = z.object({
    number: documentNumberSchema,
    // Campos reales del Vale de Salida (diseño 4.4) — destino en obra +
    // quién retira, no un "motivo" genérico. Los .max() espejan los
    // VARCHAR(n) reales de schema.sql (ver mismo comentario en
    // goods-receipt.schema.ts).
    destination_sector: z.string().trim().min(1, "El sector de destino no puede estar vacío").max(100),
    destination_level: z.string().trim().min(1, "El nivel de destino no puede estar vacío").max(100),
    destination_block: z.string().trim().min(1, "El bloque de destino no puede estar vacío").max(100),
    recipient_name: z.string().trim().min(1, "El nombre de quien retira no puede estar vacío").max(200),
    recipient_dni: recipientDniSchema,
    issue_date: dateOnlySchema,
    items: z.array(GoodsIssueItemInputSchema).min(1, "Un vale de salida necesita al menos un ítem."),
});
export type CreateGoodsIssueBody = z.infer<typeof CreateGoodsIssueBodySchema>;
