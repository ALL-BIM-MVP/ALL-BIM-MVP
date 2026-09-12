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
