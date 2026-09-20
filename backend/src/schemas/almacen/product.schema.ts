import z from 'zod';

export const ProductIdParamSchema = z.object({
    projectId: z.coerce.number(),
    productId: z.coerce.number(),
});
export type ProductIdParam = z.infer<typeof ProductIdParamSchema>;

export const ListProductsQuerySchema = z.object({
    category_id: z.coerce.number().optional(),
});
export type ListProductsQuery = z.infer<typeof ListProductsQuerySchema>;

// `code` (categoría fija) y `base_product_code` (categoría relacional)
// son mutuamente excluyentes, pero cuál de los dos hace falta depende
// de `categories.type` — un dato que vive en la BASE, no en este body.
// Acá solo se valida que no lleguen los dos juntos; cuál falta de
// verdad según la categoría real lo resuelve el service (ver
// PRODUCT_ERRORS.CODE_REQUIRED/BASE_PRODUCT_CODE_REQUIRED).
// El modelo 3D NO se crea acá — un producto siempre nace sin modelo,
// se asigna después (POST /api/model-3d-assets para subir uno nuevo,
// PUT .../products/:id/model-3d para asignar uno ya existente — ver
// docs/roadmap/almacen-bim.md) — mismo motivo por el que category_id/
// code no forman parte del PUT: identidad/estado separado del resto
// del producto, con sus propios endpoints.
export const CreateProductBodySchema = z.object({
    category_id: z.coerce.number(),
    code: z.string().trim().min(1).max(100).optional(),
    base_product_code: z.string().trim().min(1).max(100).optional(),
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(200),
    unit: z.string().trim().min(1, "La unidad no puede estar vacía").max(20),
}).refine(
    (body) => !(body.code && body.base_product_code),
    { message: "code y base_product_code son excluyentes — uno es para categoría fija, el otro para relacional.", path: ["base_product_code"] }
);
export type CreateProductBody = z.infer<typeof CreateProductBodySchema>;

// PUT reemplaza todos los campos editables de uno — no es un PATCH
// parcial (mismo criterio que el resto del módulo). A propósito NO
// incluye category_id/code/base_product_code/display_id (identidad, fijada al
// crearlo) NI nada de modelo 3D (tiene sus propios endpoints, ver
// arriba) — ver product.service.ts.
export const UpdateProductBodySchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío").max(200),
    unit: z.string().trim().min(1, "La unidad no puede estar vacía").max(20),
});
export type UpdateProductBody = z.infer<typeof UpdateProductBodySchema>;

// PUT .../products/:id/model-3d — asigna un model_3d_asset_id YA
// existente (mío, del sistema, o ya en uso en este proyecto, ver
// model-3d-asset.service.ts) — reusar sin volver a subir el archivo —
// o `null` para sacar el modelo asignado. Para subir un archivo NUEVO
// es otro endpoint aparte, SIN proyecto (POST /api/model-3d-assets,
// ver routes/almacen/model-3d-asset.routes.ts) — este es JSON puro,
// nunca recibe un archivo.
export const AssignProductModel3DBodySchema = z.object({
    model_3d_asset_id: z.coerce.number().int().positive().nullable(),
});
export type AssignProductModel3DBody = z.infer<typeof AssignProductModel3DBodySchema>;
