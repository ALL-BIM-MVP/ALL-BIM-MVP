export interface TemplateRow {
    template_id : number;
    name : string;
    description : string | null;
    is_system : boolean;
    is_default : boolean;
    created_by : number | null;
    created_at : Date;
};

export interface TemplateColumn {
    template_column_id : number;
    name : string;
    source_type : "builtin" | "ifc_property";
    builtin_field : string | null;
    property_set_name : string | null;
    property_name : string | null;
    column_order : number;
    is_visible : boolean;
};

export interface TemplateSetRow {
    template_set_id : number;
    name : string;
    sort_order : number;
};

export interface TemplateColumnRow extends TemplateColumn {
    template_set_id : number;
};

export interface TemplateSet extends TemplateSetRow {
    columns : TemplateColumn[];
};

export interface TemplateFull extends TemplateRow {
    sets : TemplateSet[];
};

// Para GET /ifc-files/:id/available-columns — el catálogo con el que el
// frontend arma/edita columnas de plantilla "en vivo" para un IFC dado:
// los builtin (fijos, iguales para cualquier archivo) + las
// property_set/property_name que ESE archivo realmente trae (source_type
// "ifc_property" en metrado_template_columns).
export interface BuiltinFieldCatalogRow {
    builtin_field : string;
    label_default : string;
    data_type : "text" | "numeric" | "integer";
    is_aggregate : boolean;
    applies_to_group : "identificacion" | "dimensiones" | "metrado" | "totales";
    sort_order : number;
};

export interface IfcPropertyCatalogRow {
    property_set : string;
    property_name : string;
    data_type : string | null;
};

export interface AvailableColumnsCatalog {
    builtin : BuiltinFieldCatalogRow[];
    ifc_properties : IfcPropertyCatalogRow[];
};

// Lo que necesita metrado-partidas.service.ts de una plantilla guardada
// para resolver el detalle de una partida (POST .../elements con
// template_id): solo las columnas source_type='ifc_property', con su
// "name" de display — las builtin no se piden acá porque no necesitan
// resolución (ver comentario en ifc-metrados.schema.ts).
export interface TemplatePropertyColumnRef {
    name : string;
    property_set_name : string;
    property_name : string;
};

// Arma sets + columnas anidados a partir de las dos listas planas —
// mismo patrón que buildPartidaTree (metrado-partidas.models.ts).
// Incluye columnas con is_visible=false a propósito (el caller nunca
// filtra eso) — así el frontend puede "restaurar" una columna que el
// usuario ocultó sin perder su configuración.
export const buildTemplateSets = (
    setRows : TemplateSetRow[], columnRows : TemplateColumnRow[]
) : TemplateSet[] => {
    const columnsBySet = new Map<number, TemplateColumn[]>();

    for (const { template_set_id, ...column } of columnRows) {
        const columns = columnsBySet.get(template_set_id) ?? [];
        columns.push(column);
        columnsBySet.set(template_set_id, columns);
    }

    return [...setRows]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((set) => ({
            ...set,
            columns: (columnsBySet.get(set.template_set_id) ?? [])
                .sort((a, b) => a.column_order - b.column_order),
        }));
};
