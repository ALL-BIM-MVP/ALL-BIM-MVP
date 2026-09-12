// almacen_estilo — catálogo global de apariencia (colores + nivel_maximo),
// NUNCA tamaño (eso lo define cada almacen con sus propias esquinas).
export interface AlmacenEstiloRow {
    almacen_estilo_id: number;
    nombre: string;
    color_techo: string;
    color_pared: string;
    color_pared_marco: string;
    nivel_maximo: number;
}
