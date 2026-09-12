// casilla — ver docs/roadmap/almacen-bim-base-datos.md 1.4. `ubicacion`
// es la coordenada estructural generada sola al crear el estante;
// `nombre` arranca igual pero es editable y puede repetirse después.
export interface CasillaRow {
    casilla_id: number;
    estante_id: number;
    bahia: number;
    nivel: number;
    cara: number;
    ubicacion: string;
    nombre: string;
    creado_en: Date;
    actualizado_en: Date | null;
}
