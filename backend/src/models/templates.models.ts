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
