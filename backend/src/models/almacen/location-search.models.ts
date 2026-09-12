// GET .../locations/search — resultado unificado, sea cual sea el
// tipo de entidad que matcheó. `path` es la miga de pan legible
// (warehouse → rack → bin) para que el frontend no tenga que
// resolverla con JOINs propios.
export interface LocationSearchResult {
    type: "warehouse" | "rack" | "bin";
    warehouse_id: number;
    rack_id: number | null;
    bin_id: number | null;
    name: string;
    path: string;
}
