import z from 'zod';
import { dateOnlySchema } from './goods-receipt.schema.js';

export const PurchaseOrderIdParamSchema = z.object({
    projectId: z.coerce.number(),
    purchaseOrderId: z.coerce.number(),
});
export type PurchaseOrderIdParam = z.infer<typeof PurchaseOrderIdParamSchema>;

export const PurchaseOrderItemIdParamSchema = PurchaseOrderIdParamSchema.extend({
    itemId: z.coerce.number(),
});
export type PurchaseOrderItemIdParam = z.infer<typeof PurchaseOrderItemIdParamSchema>;

// Los .max y los CHECK espejan schema.sql (ver el mismo criterio en quotation.schema.ts).
const MAX_NUMERIC = 999_999_999_999;
const idSchema = z.coerce.number().int().positive();
const numberSchema = z.string().trim().min(1, "El número no puede estar vacío").max(30);
const currencySchema = z.enum(["PEN", "USD"]);
const termsSchema = z.string().trim().min(1).max(1000);
const descriptionSchema = z.string().trim().min(1, "La descripción no puede estar vacía").max(300);
const notesSchema = z.string().trim().min(1).max(500);
const quantitySchema = z.coerce.number().positive().max(MAX_NUMERIC);
const amountSchema = z.coerce.number().min(0).max(MAX_NUMERIC);

const ItemFields = {
    // Vínculos OPCIONALES a los documentos anteriores. Si se envían, el service
    // comprueba que sean del origen de la orden y que el producto coincida.
    quotation_item_id: idSchema.nullable().optional(),
    purchase_requisition_item_id: idSchema.nullable().optional(),
    // Obligatorio solo si la línea no cita ninguna línea anterior (el service lo valida).
    product_id: idSchema.optional(),
    description: descriptionSchema,
    quantity_ordered: quantitySchema,
    // Solo si el documento los muestra; null/omitido = no figura.
    unit_price: amountSchema.nullable().optional(),
    discount_amount: amountSchema.nullable().optional(),
    tax_amount: amountSchema.nullable().optional(),
    // Obligatorio: el monto de la línea como lo dice el documento.
    line_total: amountSchema,
    notes: notesSchema.nullable().optional(),
};

export const CreatePurchaseOrderItemBodySchema = z.object(ItemFields);
export type CreatePurchaseOrderItemBody = z.infer<typeof CreatePurchaseOrderItemBodySchema>;

// PATCH: solo los campos enviados; al menos uno. Los vínculos y el producto
// son la identidad de la línea: no se cambian (se quita y se agrega).
const atLeastOne = (body: object) => Object.keys(body).length > 0;
const AT_LEAST_ONE = { message: "Debe enviarse al menos un campo para modificar." };

export const UpdatePurchaseOrderItemBodySchema = z.object({
    description: ItemFields.description,
    quantity_ordered: ItemFields.quantity_ordered,
    unit_price: amountSchema.nullable(),
    discount_amount: amountSchema.nullable(),
    tax_amount: amountSchema.nullable(),
    line_total: ItemFields.line_total,
    notes: notesSchema.nullable(),
}).partial().refine(atLeastOne, AT_LEAST_ONE);
export type UpdatePurchaseOrderItemBody = z.infer<typeof UpdatePurchaseOrderItemBodySchema>;

export const CreatePurchaseOrderBodySchema = z.object({
    supplier_id: idSchema,
    // Origen opcional (compra directa si no hay ninguno). Con cotización, el
    // requerimiento se deduce de ella; si se envía también, debe coincidir.
    purchase_requisition_id: idSchema.nullable().optional(),
    quotation_id: idSchema.nullable().optional(),
    number: numberSchema,
    order_date: dateOnlySchema,
    currency: currencySchema,
    commercial_terms: termsSchema.nullable().optional(),
    total_amount: amountSchema.nullable().optional(),
    items: z.array(CreatePurchaseOrderItemBodySchema).min(1, "Una orden de compra necesita al menos una línea.").max(500),
});
export type CreatePurchaseOrderBody = z.infer<typeof CreatePurchaseOrderBodySchema>;

// Cabecera parcial. El proveedor y el origen identifican la orden: no se
// cambian (si hubo error, se da de baja y se vuelve a crear).
export const UpdatePurchaseOrderBodySchema = z.object({
    number: numberSchema,
    order_date: dateOnlySchema,
    currency: currencySchema,
    commercial_terms: termsSchema.nullable(),
    total_amount: amountSchema.nullable(),
}).partial().refine(atLeastOne, AT_LEAST_ONE);
export type UpdatePurchaseOrderBody = z.infer<typeof UpdatePurchaseOrderBodySchema>;

// file_id null = quitar el archivo (se elimina del sistema).
export const SetPurchaseOrderFileBodySchema = z.object({
    file_id: z.coerce.number().int().positive().nullable(),
});
export type SetPurchaseOrderFileBody = z.infer<typeof SetPurchaseOrderFileBodySchema>;

export const ListPurchaseOrdersQuerySchema = z.object({
    supplier_id: idSchema.optional(),
    purchase_requisition_id: idSchema.optional(),
    quotation_id: idSchema.optional(),
    search: z.string().trim().min(1).max(200).optional(),
});
export type ListPurchaseOrdersQuery = z.infer<typeof ListPurchaseOrdersQuerySchema>;
