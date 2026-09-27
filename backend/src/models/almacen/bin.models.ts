// bins — ver docs/roadmap/almacen-bim-base-datos.md 1.4. `location_label`
// es la coordenada estructural generada sola al crear el rack; `name`
// arranca igual pero es editable y puede repetirse después.
export interface BinRow {
    bin_id: number;
    rack_id: number;
    bay: number;
    level: number;
    face: number;
    location_label: string;
    name: string;
    created_at: Date;
    updated_at: Date | null;
}

// Qué hay guardado en un bin puntual — no existía ningún endpoint que
// lo mostrara (bin_contents solo se tocaba desde goods-receipt/
// goods-issue, nunca se leía directo) hasta que se pidió explícito
// poder verlo en el detalle de un estante. `[]` = bin vacío. Incluye
// los datos del modelo 3D del producto (si tiene) para que el
// frontend pueda mostrarlo ahí mismo, sin una consulta aparte por cada
// bin ocupado.
export interface BinContentSummary {
    // BIGINT como texto (ver agent-guide/01-backend.md) — es el id que se manda al
    // PATCH de pose (bin.service.ts, updateBinContentPoseService).
    bin_content_id: string;
    product_id: number;
    category_id: number;
    code: string;
    display_id: number;
    name: string;
    unit: string;
    quantity: string;
    model_3d_format: string | null;
    // Lista para usar con Authorization: Bearer normal (ver
    // model-3d-asset.models.ts, buildModel3DAssetUrl) — nunca un path
    // crudo del disco.
    model_3d_url: string | null;
    // Ajuste fino de cómo se ve ESTE contenido dentro de la casilla (nunca cuánto hay,
    // ver database/schema.sql, bin_contents). rotation_x/y/z en radianes. Se editan con
    // el PATCH de pose, nunca desde un ingreso/vale/ajuste.
    position_x: string;
    position_y: string;
    position_z: string;
    rotation_x: string;
    rotation_y: string;
    rotation_z: string;
    scale: string | null;
}

export interface BinWithContents extends BinRow {
    contents: BinContentSummary[];
}
