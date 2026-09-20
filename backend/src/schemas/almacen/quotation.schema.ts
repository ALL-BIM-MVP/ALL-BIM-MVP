import z from 'zod';
import { dateOnlySchema } from './goods-receipt.schema.js';

export const QuotationIdParamSchema = z.object({
    projectId: z.coerce.number(),
    quotationId: z.coerce.number(),
});
export type QuotationIdParam = z.infer<typeof QuotationIdParamSchema>;

export const QuotationItemIdParamSchema = QuotationIdParamSchema.extend({
    itemId: z.coerce.number(),
});
export type QuotationItemIdParam = z.infer<typeof QuotationItemIdParamSchema>;

// Los .max y los CHECK espejan schema.sql. NUMERIC(18,6) admite hasta 12
// dígitos enteros: se acota para que un valor enorme dé 400 y no un error de
// la base.
const MAX_NUMERIC = 999_999_999_999;
const idSchema = z.coerce.number().int().positive();
const numberSchema = z.string().trim().min(1, "El número no puede estar vacío").max(30);
// Moneda: lista cerrada (mismo CHECK que quotations.currency).
const currencySchema = z.enum(["PEN", "USD"]);
const termsSchema = z.string().trim().min(1).max(1000);
const descriptionSchema = z.string().trim().min(1, "La descripción no puede estar vacía").max(300);
const notesSchema = z.string().trim().min(1).max(500);
const quantitySchema = z.coerce.number().positive().max(MAX_NUMERIC);
const amountSchema = z.coerce.number().min(0).max(MAX_NUMERIC);

const ItemFields = {
    purchase_requisition_item_id: idSchema,
    // Opcional: la línea usa el producto de la línea del requerimiento; si se
    // envía tiene que coincidir (lo valida el service).
    product_id: idSchema.optional(),
    description: descriptionSchema,
    quantity_quoted: quantitySchema,
    // Solo si el documento los muestra; null/omitido = no figura.
    unit_price: amountSchema.nullable().optional(),
    discount_amount: amountSchema.nullable().optional(),
    tax_amount: amountSchema.nullable().optional(),
    // Obligatorio: el monto de la línea como lo dice el documento.
    line_total: amountSchema,
    notes: notesSchema.nullable().optional(),
};

export const CreateQuotationItemBodySchema = z.object(ItemFields);
export type CreateQuotationItemBody = z.infer<typeof CreateQuotationItemBodySchema>;

// PATCH: solo los campos enviados; al menos uno. La línea del requerimiento y
// el producto son la identidad de la línea: no se cambian (se quita y se agrega).
const atLeastOne = (body: object) => Object.keys(body).length > 0;
const AT_LEAST_ONE = { message: "Debe enviarse al menos un campo para modificar." };

export const UpdateQuotationItemBodySchema = z.object({
    description: ItemFields.description,
    quantity_quoted: ItemFields.quantity_quoted,
    unit_price: amountSchema.nullable(),
    discount_amount: amountSchema.nullable(),
    tax_amount: amountSchema.nullable(),
    line_total: ItemFields.line_total,
    notes: notesSchema.nullable(),
}).partial().refine(atLeastOne, AT_LEAST_ONE);
export type UpdateQuotationItemBody = z.infer<typeof UpdateQuotationItemBodySchema>;

export const CreateQuotationBodySchema = z.object({
    supplier_id: idSchema,
    purchase_requisition_id: idSchema,
    number: numberSchema,
    quotation_date: dateOnlySchema,
    currency: currencySchema,
    commercial_terms: termsSchema.nullable().optional(),
    valid_until: dateOnlySchema.nullable().optional(),
    // Total del documento, opcional (null = no lo indica).
    total_amount: amountSchema.nullable().optional(),
    items: z.array(CreateQuotationItemBodySchema).min(1, "Una cotización necesita al menos una línea.").max(500),
}).refine(
    (body) => new Set(body.items.map((i) => i.purchase_requisition_item_id)).size === body.items.length,
    { message: "Una línea del requerimiento no se cotiza dos veces en la misma cotización.", path: ["items"] }
).refine(
    (body) => !body.valid_until || body.valid_until >= body.quotation_date,
    { message: "La validez no puede ser anterior a la fecha de la cotización.", path: ["valid_until"] }
);
export type CreateQuotationBody = z.infer<typeof CreateQuotationBodySchema>;

// Cabecera parcial. El proveedor y el requerimiento identifican la cotización:
// no se cambian (si hubo error, se da de baja y se vuelve a crear).
export const UpdateQuotationBodySchema = z.object({
    number: numberSchema,
    quotation_date: dateOnlySchema,
    currency: currencySchema,
    commercial_terms: termsSchema.nullable(),
    valid_until: dateOnlySchema.nullable(),
    total_amount: amountSchema.nullable(),
}).partial().refine(atLeastOne, AT_LEAST_ONE);
export type UpdateQuotationBody = z.infer<typeof UpdateQuotationBodySchema>;

// file_id null = quitar el archivo (se elimina del sistema).
export const SetQuotationFileBodySchema = z.object({
    file_id: z.coerce.number().int().positive().nullable(),
});
export type SetQuotationFileBody = z.infer<typeof SetQuotationFileBodySchema>;

export const ListQuotationsQuerySchema = z.object({
    purchase_requisition_id: idSchema.optional(),
    supplier_id: idSchema.optional(),
    search: z.string().trim().min(1).max(200).optional(),
});
export type ListQuotationsQuery = z.infer<typeof ListQuotationsQuerySchema>;
