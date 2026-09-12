// GET .../ubicaciones/buscar — resultado unificado, sea cual sea el
// tipo de entidad que matcheó. `path` es la miga de pan legible
// (almacén → estante → casilla) para que el frontend no tenga que
// resolverla con JOINs propios.
export interface UbicacionBusquedaResultado {
    tipo: "almacen" | "estante" | "casilla";
    almacen_id: number;
    estante_id: number | null;
    casilla_id: number | null;
    nombre: string;
    path: string;
}
