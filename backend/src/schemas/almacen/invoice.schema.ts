import z from 'zod';
import { dateOnlySchema } from './goods-receipt.schema.js';
import {
    AT_LEAST_ONE, amountSchema, fileIdSchema, atLeastOne, currencySchema, descriptionSchema, idSchema, notesSchema, quantitySchema,
} from './document-common.schema.js';

export const InvoiceIdParamSchema = z.object({
    projectId: z.coerce.number(),
    invoiceId: z.coerce.number(),
});
export type InvoiceIdParam = z.infer<typeof InvoiceIdParamSchema>;

export const InvoiceItemIdParamSchema = InvoiceIdParamSchema.extend({
    itemId: z.coerce.number(),
});
export type InvoiceItemIdParam = z.infer<typeof InvoiceItemIdParamSchema>;

// Serie y número SEPARADOS como vienen en el documento (formato SUNAT, ver el
// comentario de invoices en schema.sql). La serie se normaliza a mayúsculas; el
// número son 1 a 8 dígitos. Mismos CHECK que invoices.series/number.
const seriesSchema = z.string().trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{1,4}$/, "La serie de la factura debe tener de 1 a 4 letras o números, sin guiones ni espacios"));
const numberSchema = z.string().trim()
    .regex(/^\d{1,8}$/, "El número de la factura debe tener de 1 a 8 dígitos");

const ItemFields = {
    // Con orden de origen es OBLIGATORIO (la línea de esa orden); sin orden no se envía.
    purchase_order_item_id: idSchema.nullable().optional(),
    // Obligatorio solo si la factura no tiene orden (el service lo valida).
    product_id: idSchema.optional(),
    description: descriptionSchema,
    quantity_invoiced: quantitySchema,
    // Solo si el documento los muestra; null/omitido = no figura.
    unit_price: amountSchema.nullable().optional(),
    discount_amount: amountSchema.nullable().optional(),
    tax_amount: amountSchema.nullable().optional(),
    // Obligatorio: el monto de la línea como lo dice el documento.
    line_total: amountSchema,
    notes: notesSchema.nullable().optional(),
};

export const CreateInvoiceItemBodySchema = z.object(ItemFields);
export type CreateInvoiceItemBody = z.infer<typeof CreateInvoiceItemBodySchema>;

// PATCH: solo los campos enviados; al menos uno. El vínculo con la orden y el
// producto son la identidad de la línea: no se cambian (se quita y se agrega).
export const UpdateInvoiceItemBodySchema = z.object({
    description: ItemFields.description,
    quantity_invoiced: ItemFields.quantity_invoiced,
    unit_price: amountSchema.nullable(),
    discount_amount: amountSchema.nullable(),
    tax_amount: amountSchema.nullable(),
    line_total: ItemFields.line_total,
    notes: notesSchema.nullable(),
}).partial().refine(atLeastOne, AT_LEAST_ONE);
export type UpdateInvoiceItemBody = z.infer<typeof UpdateInvoiceItemBodySchema>;

export const CreateInvoiceBodySchema = z.object({
    supplier_id: idSchema,
    // Origen opcional (factura sin orden si no hay). Con orden, cada línea la cita.
    purchase_order_id: idSchema.nullable().optional(),
    series: seriesSchema,
    number: numberSchema,
    invoice_date: dateOnlySchema,
    currency: currencySchema,
    // Montos del documento, opcionales (null = no figura).
    subtotal_amount: amountSchema.nullable().optional(),
    tax_amount: amountSchema.nullable().optional(),
    total_amount: amountSchema.nullable().optional(),
    file_id: fileIdSchema,
    items: z.array(CreateInvoiceItemBodySchema).min(1, "Una factura necesita al menos una línea.").max(500),
});
export type CreateInvoiceBody = z.infer<typeof CreateInvoiceBodySchema>;

// Cabecera parcial. El proveedor y la orden identifican la factura: no se
// cambian (si hubo error, se da de baja y se vuelve a crear).
export const UpdateInvoiceBodySchema = z.object({
    series: seriesSchema,
    number: numberSchema,
    invoice_date: dateOnlySchema,
    currency: currencySchema,
    subtotal_amount: amountSchema.nullable(),
    tax_amount: amountSchema.nullable(),
    total_amount: amountSchema.nullable(),
}).partial().refine(atLeastOne, AT_LEAST_ONE);
export type UpdateInvoiceBody = z.infer<typeof UpdateInvoiceBodySchema>;

// file_id null = quitar el archivo (se elimina del sistema).
export const SetInvoiceFileBodySchema = z.object({
    file_id: z.coerce.number().int().positive().nullable(),
});
export type SetInvoiceFileBody = z.infer<typeof SetInvoiceFileBodySchema>;

export const ListInvoicesQuerySchema = z.object({
    supplier_id: idSchema.optional(),
    purchase_order_id: idSchema.optional(),
    search: z.string().trim().min(1).max(200).optional(),
});
export type ListInvoicesQuery = z.infer<typeof ListInvoicesQuerySchema>;
