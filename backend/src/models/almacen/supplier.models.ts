// suppliers (proveedores por proyecto) — ver database/schema.sql y
// docs/almacen-ingreso-productos/05-roadmap.md, Fase 2.
export interface SupplierRow {
    supplier_id: number;
    project_id: number;
    ruc: string;
    name: string;
    created_at: Date;
    created_by: number;
    updated_at: Date | null;
    updated_by: number | null;
    deleted_at: Date | null;
}

// documents_count = cuántos documentos usan a este proveedor (hoy solo
// ingresos; se suman los demás documentos a medida que existan). Es lo
// que decide si el RUC todavía se puede cambiar y si se puede dar de
// baja: el frontend lo usa para deshabilitar esas acciones.
export interface Supplier extends SupplierRow {
    documents_count: number;
}
