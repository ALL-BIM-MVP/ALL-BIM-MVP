import z from 'zod';
import { dateOnlySchema } from './goods-receipt.schema.js';
import { idSchema } from './document-common.schema.js';

export const AdjustmentIdParamSchema = z.object({
    projectId: z.coerce.number(),
    adjustmentId: z.coerce.number(),
});
export type AdjustmentIdParam = z.infer<typeof AdjustmentIdParamSchema>;

// Motivo obligatorio (mismo .max que inventory_adjustments.reason VARCHAR(500)).
const reasonSchema = z.string().trim().min(1, "El motivo del ajuste es obligatorio").max(500);
// Cambio de cantidad: distinto de cero, con signo, dentro de NUMERIC(18,6).
const deltaSchema = z.coerce.number().refine((v) => v !== 0, "El cambio de cantidad no puede ser 0")
    .refine((v) => Math.abs(v) <= 999_999_999_999, "El cambio de cantidad es demasiado grande");

// Fecha de la corrección: opcional (por defecto hoy).
const BaseBody = {
    reason: reasonSchema,
    adjustment_date: dateOnlySchema.optional(),
};

const noDuplicateLines = (key: "goods_receipt_item_id" | "goods_issue_item_id") =>
    (body: { items: Record<string, unknown>[] }) =>
        new Set(body.items.map((i) => `${i[key]}:${i.bin_id}`)).size === body.items.length;
const DUPLICATE_MESSAGE = { message: "Una línea no se corrige dos veces en la misma casilla dentro de un ajuste.", path: ["items"] };

// Corrección de un INGRESO: por línea y casilla.
export const CorrectGoodsReceiptBodySchema = z.object({
    ...BaseBody,
    items: z.array(z.object({
        goods_receipt_item_id: idSchema, bin_id: idSchema, quantity_delta: deltaSchema,
    })).min(1, "El ajuste necesita al menos una línea.").max(200),
}).refine(noDuplicateLines("goods_receipt_item_id"), DUPLICATE_MESSAGE);
export type CorrectGoodsReceiptBody = z.infer<typeof CorrectGoodsReceiptBodySchema>;

// Corrección de un VALE DE SALIDA: por línea y casilla.
export const CorrectGoodsIssueBodySchema = z.object({
    ...BaseBody,
    items: z.array(z.object({
        goods_issue_item_id: idSchema, bin_id: idSchema, quantity_delta: deltaSchema,
    })).min(1, "El ajuste necesita al menos una línea.").max(200),
}).refine(noDuplicateLines("goods_issue_item_id"), DUPLICATE_MESSAGE);
export type CorrectGoodsIssueBody = z.infer<typeof CorrectGoodsIssueBodySchema>;

// Anulación completa: solo motivo (y fecha opcional).
export const VoidDocumentBodySchema = z.object(BaseBody);
export type VoidDocumentBody = z.infer<typeof VoidDocumentBodySchema>;

export const ListAdjustmentsQuerySchema = z.object({
    goods_receipt_id: idSchema.optional(),
    goods_issue_id: idSchema.optional(),
    kind: z.enum(["correccion", "anulacion"]).optional(),
});
export type ListAdjustmentsQuery = z.infer<typeof ListAdjustmentsQuerySchema>;
