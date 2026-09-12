// warehouse_styles — catálogo global de apariencia (colores +
// max_level), NUNCA tamaño (eso lo define cada warehouse con sus
// propias esquinas).
export interface WarehouseStyleRow {
    warehouse_style_id: number;
    name: string;
    roof_color: string;
    wall_color: string;
    wall_frame_color: string;
    max_level: number;
}
