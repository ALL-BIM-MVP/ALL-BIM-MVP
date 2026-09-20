import z from 'zod';

export const SupplierIdParamSchema = z.object({
    projectId: z.coerce.number(),
    supplierId: z.coerce.number(),
});
export type SupplierIdParam = z.infer<typeof SupplierIdParamSchema>;

// RUC peruano (SUNAT): SIEMPRE 11 dígitos numéricos exactos, nunca
// letras/guiones/espacios propios del identificador — mismo CHECK que
// espeja suppliers.ruc en schema.sql (~ '^\d{11}$'). `.replace` antes
// de validar es tolerancia de tipeo/copy-paste (un RUC copiado de una
// factura a veces trae espacios o un guion tipo "20-123456789"), NO
// relaja la regla: lo que llega a la base sigue siendo exactamente 11
// dígitos limpios.
const RUC_REGEX = /^\d{11}$/;
export const supplierRucSchema = z.string().trim()
    .transform((v) => v.replace(/[\s-]/g, ""))
    .pipe(z.string().regex(RUC_REGEX, "El RUC debe tener exactamente 11 dígitos numéricos (formato SUNAT)"));

// .max(200) espeja suppliers.name VARCHAR(200) en schema.sql.
const supplierNameSchema = z.string().trim().min(1, "El nombre no puede estar vacío").max(200);

export const CreateSupplierBodySchema = z.object({
    ruc: supplierRucSchema,
    name: supplierNameSchema,
});
export type CreateSupplierBody = z.infer<typeof CreateSupplierBodySchema>;

// PUT reemplaza los dos campos (no es un PATCH parcial). El RUC solo se
// puede cambiar mientras el proveedor no tenga documentos: lo valida el
// service, no este schema.
export const UpdateSupplierBodySchema = CreateSupplierBodySchema;
export type UpdateSupplierBody = z.infer<typeof UpdateSupplierBodySchema>;

// Búsqueda para el autocompletado: por RUC (completo o el comienzo) o
// por parte del nombre.
export const ListSuppliersQuerySchema = z.object({
    search: z.string().trim().min(1).max(200).optional(),
});
export type ListSuppliersQuery = z.infer<typeof ListSuppliersQuerySchema>;
