import z from 'zod';
import { dateOnlySchema } from './goods-receipt.schema.js';
import { fileIdSchema } from './document-common.schema.js';

export const PurchaseRequisitionIdParamSchema = z.object({
    projectId: z.coerce.number(),
    purchaseRequisitionId: z.coerce.number(),
});
export type PurchaseRequisitionIdParam = z.infer<typeof PurchaseRequisitionIdParamSchema>;

export const PurchaseRequisitionItemIdParamSchema = PurchaseRequisitionIdParamSchema.extend({
    itemId: z.coerce.number(),
});
export type PurchaseRequisitionItemIdParam = z.infer<typeof PurchaseRequisitionItemIdParamSchema>;

// Los .max espejan los VARCHAR y los CHECK de schema.sql. NUMERIC(18,6)
// admite hasta 12 dígitos enteros: se acota para que un valor enorme dé
// 400 y no un error de la base.
const MAX_NUMERIC = 999_999_999_999;
const numberSchema = z.string().trim().min(1, "El número no puede estar vacío").max(30);
const requesterSchema = z.string().trim().min(1, "El solicitante no puede estar vacío").max(150);
const notesSchema = z.string().trim().min(1).max(1000);
const descriptionSchema = z.string().trim().min(1, "La descripción no puede estar vacía").max(300);
const quantitySchema = z.coerce.number().positive().max(MAX_NUMERIC);
const priceSchema = z.coerce.number().min(0).max(MAX_NUMERIC);
const productIdSchema = z.coerce.number().int().positive();

const ItemFields = {
    // Siempre un producto del catálogo (si aún no existe, se crea antes).
    product_id: productIdSchema,
    description: descriptionSchema,
    quantity_requested: quantitySchema,
    estimated_unit_price: priceSchema.nullable().optional(),
};

export const CreatePurchaseRequisitionItemBodySchema = z.object(ItemFields);
export type CreatePurchaseRequisitionItemBody = z.infer<typeof CreatePurchaseRequisitionItemBodySchema>;

// PATCH: solo los campos enviados; al menos uno.
const atLeastOne = (body: object) => Object.keys(body).length > 0;
const AT_LEAST_ONE = { message: "Debe enviarse al menos un campo para modificar." };

export const UpdatePurchaseRequisitionItemBodySchema = z.object(ItemFields).partial().refine(atLeastOne, AT_LEAST_ONE);
export type UpdatePurchaseRequisitionItemBody = z.infer<typeof UpdatePurchaseRequisitionItemBodySchema>;

export const CreatePurchaseRequisitionBodySchema = z.object({
    number: numberSchema,
    requisition_date: dateOnlySchema,
    requester: requesterSchema,
    notes: notesSchema.nullable().optional(),
    file_id: fileIdSchema,
    items: z.array(CreatePurchaseRequisitionItemBodySchema)
        .min(1, "Un requerimiento necesita al menos una línea.").max(500),
});
export type CreatePurchaseRequisitionBody = z.infer<typeof CreatePurchaseRequisitionBodySchema>;

// Cabecera parcial: las líneas tienen sus propios endpoints.
export const UpdatePurchaseRequisitionBodySchema = z.object({
    number: numberSchema,
    requisition_date: dateOnlySchema,
    requester: requesterSchema,
    notes: notesSchema.nullable(),
}).partial().refine(atLeastOne, AT_LEAST_ONE);
export type UpdatePurchaseRequisitionBody = z.infer<typeof UpdatePurchaseRequisitionBodySchema>;

// file_id null = quitar el archivo (se elimina del sistema).
export const SetPurchaseRequisitionFileBodySchema = z.object({
    file_id: z.coerce.number().int().positive().nullable(),
});
export type SetPurchaseRequisitionFileBody = z.infer<typeof SetPurchaseRequisitionFileBodySchema>;

export const ListPurchaseRequisitionsQuerySchema = z.object({
    search: z.string().trim().min(1).max(200).optional(),
});
export type ListPurchaseRequisitionsQuery = z.infer<typeof ListPurchaseRequisitionsQuerySchema>;
