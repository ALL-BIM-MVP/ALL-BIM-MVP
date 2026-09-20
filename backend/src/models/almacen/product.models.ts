import { buildModel3DAssetUrl } from "./model-3d-asset.models.js";

// products (catálogo) — ver docs/roadmap/almacen-bim-base-datos.md 2.2.
// model_3d_asset_id es la ÚNICA columna real de "qué modelo tiene" —
// NULL = sin modelo. Corregido: la primera versión de este campo era
// un `model_3d_path` de texto libre sin ningún archivo real detrás
// cuando decía "subido". Error real, no de estilo: un producto "con
// modelo" tiene que apuntar a algo que de verdad existe (una fila real
// de model_3d_assets — del usuario que lo subió, no de este proyecto,
// ver ese archivo).
// Resumen incrustado en las respuestas de otros recursos (ver utils/product-summary.ts).
export interface ProductSummary {
    product_id: number;
    category_id: number;
    code: string;
    display_id: number;
    name: string;
    unit: string;
}

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
    // El ID que ve el usuario (encabezado "ID" en el frontend) — un
    // correlativo propio de este sistema, independiente por categoría
    // (ver categories.next_display_id). Renombrado de `tag`: no tiene
    // ninguna relación con el `tag` de Revit que usa metrado_elements/
    // ifc_elements (otro módulo, otro campo).
    display_id: number;
    name: string;
    unit: string;
    model_3d_asset_id: number | null;
    // Cuándo se le asignó el modelo ACTUAL a ESTE producto — distinto
    // de model_3d_assets.created_at (cuándo se subió/creó el asset en
    // sí, que puede ser antes y reusarse en varios productos).
    model_3d_assigned_at: Date | null;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
}

// Fila cruda tal como sale de un LEFT JOIN products ↔ model_3d_assets
// — nunca se expone tal cual al cliente, transformProductModel3D la
// convierte en los 3 campos públicos de abajo (mismo criterio que
// FileRow/transformFileToFull en files.models.ts: lo crudo del JOIN es
// interno, se resuelve antes de salir).
export interface ProductRowWithAssetJoin extends ProductRow {
    model_3d_name: string | null;
    model_3d_format: string | null;
}

export interface ProductWithModel3D extends ProductRow {
    model_3d_name: string | null;
    model_3d_format: string | null;
    // URL lista para usar (GLTFLoader.load(url) directo, con
    // Authorization: Bearer normal — NO es una URL firmada, ver
    // buildModel3DAssetUrl: el archivo puede vivir y reusarse mucho
    // tiempo entre productos/proyectos, así que se revalida en cada
    // pedido en vez de vencer a los 5 minutos). null si no hay modelo
    // asignado.
    model_3d_url: string | null;
}

// Recibe projectId aparte (no viene en `p`) porque la URL siempre es
// relativa a "desde qué proyecto se está mirando esto" — ver
// VISIBILITY_CLAUSE en model-3d-asset.service.ts.
export const transformProductModel3D = (p: ProductRowWithAssetJoin, projectId: number): ProductWithModel3D => {
    return {
        ...p,
        model_3d_url: p.model_3d_asset_id !== null ? buildModel3DAssetUrl(projectId, p.model_3d_asset_id) : null,
    };
};

// stock total y ubicación principal NO son columnas — se calculan
// siempre con SUM/MAX sobre bin_contents (ver diseño 2.2).
export interface ProductListing extends ProductWithModel3D {
    total_stock: string;
    main_location: string | null;
}

// Solo cuando este producto es de una categoría 'fijo' (una Partida):
// sus Materiales/Equipos relacionados (base_product_code = este code).
// [] para un producto de categoría 'relacional' — no tiene sentido
// simétrico (una Partida no "pertenece" a sus propios relacionados).
export interface ProductDetail extends ProductListing {
    related: ProductRow[];
}
