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
    product_id: number;
    code: string;
    name: string;
    quantity: number;
    model_3d_path: string | null;
    model_3d_format: string | null;
}

export interface BinWithContents extends BinRow {
    contents: BinContentSummary[];
}
