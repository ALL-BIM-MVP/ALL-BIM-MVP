import z from 'zod';

// Piezas de validación compartidas por los documentos de Almacén con montos
// (cotización, orden de compra, factura). Los .max y los CHECK espejan schema.sql.

// NUMERIC(18,6) admite hasta 12 dígitos enteros: se acota para que un valor
// enorme dé 400 y no un error de la base.
export const MAX_NUMERIC = 999_999_999_999;

export const idSchema = z.coerce.number().int().positive();
export const documentNumberSchema = z.string().trim().min(1, "El número no puede estar vacío").max(30);
// Moneda: lista cerrada (mismo CHECK que quotations/purchase_orders/invoices.currency).
export const currencySchema = z.enum(["PEN", "USD"]);
export const termsSchema = z.string().trim().min(1).max(1000);
export const descriptionSchema = z.string().trim().min(1, "La descripción no puede estar vacía").max(300);
export const notesSchema = z.string().trim().min(1).max(500);
export const quantitySchema = z.coerce.number().positive().max(MAX_NUMERIC);
export const amountSchema = z.coerce.number().min(0).max(MAX_NUMERIC);

// PATCH: solo los campos enviados; al menos uno.
export const atLeastOne = (body: object) => Object.keys(body).length > 0;
export const AT_LEAST_ONE = { message: "Debe enviarse al menos un campo para modificar." };
