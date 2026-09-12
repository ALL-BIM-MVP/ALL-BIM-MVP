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

const MODEL_3D_SOURCE = ["repositorio", "subido", "generado_ia"] as const;

// `code` (categoría fija) y `base_product_code` (categoría relacional)
// son mutuamente excluyentes, pero cuál de los dos hace falta depende
// de `categories.type` — un dato que vive en la BASE, no en este body.
// Acá solo se valida que no lleguen los dos juntos; cuál falta de
// verdad según la categoría real lo resuelve el service (ver
// PRODUCT_ERRORS.CODE_REQUIRED/BASE_PRODUCT_CODE_REQUIRED).
export const CreateProductBodySchema = z.object({
    category_id: z.coerce.number(),
    code: z.string().trim().min(1).optional(),
    base_product_code: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1, "El nombre no puede estar vacío"),
    unit: z.string().trim().min(1, "La unidad no puede estar vacía"),
    model_3d_path: z.string().trim().min(1).optional(),
    model_3d_format: z.string().trim().min(1).optional(),
    model_3d_source: z.enum(MODEL_3D_SOURCE).optional(),
}).refine(
    (body) => !(body.code && body.base_product_code),
    { message: "code y base_product_code son excluyentes — uno es para categoría fija, el otro para relacional.", path: ["base_product_code"] }
).refine(
    // Espeja el CHECK real de la tabla (products.model_3d_path IS NULL
    // = model_3d_format IS NULL) — mensaje legible antes de llegar a
    // la base.
    (body) => (body.model_3d_path === undefined) === (body.model_3d_format === undefined),
    { message: "model_3d_path y model_3d_format van juntos: los dos o ninguno.", path: ["model_3d_format"] }
);
export type CreateProductBody = z.infer<typeof CreateProductBodySchema>;

// PUT reemplaza todos los campos editables de uno — no es un PATCH
// parcial (mismo criterio que el resto del módulo). A propósito NO
// incluye category_id/code/base_product_code/tag — son la identidad
// del producto, fijada al crearlo (ver product.service.ts).
export const UpdateProductBodySchema = z.object({
    name: z.string().trim().min(1, "El nombre no puede estar vacío"),
    unit: z.string().trim().min(1, "La unidad no puede estar vacía"),
    // null = sacar el modelo asignado.
    model_3d_path: z.string().trim().min(1).nullable().optional(),
    model_3d_format: z.string().trim().min(1).nullable().optional(),
    model_3d_source: z.enum(MODEL_3D_SOURCE).nullable().optional(),
}).refine(
    (body) => (body.model_3d_path == null) === (body.model_3d_format == null),
    { message: "model_3d_path y model_3d_format van juntos: los dos, o los dos null para sacar el modelo.", path: ["model_3d_format"] }
);
export type UpdateProductBody = z.infer<typeof UpdateProductBodySchema>;
