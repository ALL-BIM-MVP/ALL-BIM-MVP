// products (catálogo) — ver docs/roadmap/almacen-bim-base-datos.md 2.2.
export interface ProductRow {
    product_id: number;
    project_id: number;
    category_id: number;
    code: string;
    // Copia de `categories.type === 'fijo'` al momento de crear este
    // producto — solo existe para que el código sea único entre
    // productos fijos y pueda repetirse entre relacionales (ver
    // database/schema.sql, columna `products.is_fixed`).
    is_fixed: boolean;
    base_product_code: string | null;
    tag: number;
    name: string;
    unit: string;
    model_3d_path: string | null;
    model_3d_format: string | null;
    // Valores reales en español (ya existían así en el prototipo de
    // BIM/Modelos).
    model_3d_source: "repositorio" | "subido" | "generado_ia" | null;
    model_3d_assigned_at: Date | null;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
}

// stock total y ubicación principal NO son columnas — se calculan
// siempre con SUM/MAX sobre bin_contents (ver diseño 2.2).
export interface ProductListing extends ProductRow {
    total_stock: number;
    main_location: string | null;
}

// Solo cuando este producto es de una categoría 'fijo' (una Partida):
// sus Materiales/Equipos relacionados (base_product_code = este code).
// [] para un producto de categoría 'relacional' — no tiene sentido
// simétrico (una Partida no "pertenece" a sus propios relacionados).
export interface ProductDetail extends ProductListing {
    related: ProductRow[];
}
