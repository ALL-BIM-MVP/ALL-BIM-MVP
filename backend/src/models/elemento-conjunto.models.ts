// elemento-conjunto.models.ts
//
// Configuración por proyecto de QUÉ campos componen la clave de
// "elemento conjunto" (ver metrados-estado.models.ts para el reporte
// en sí que consume esta config). Antes esos campos eran fijos
// (archivo+guid+tag+código); ahora el usuario elige, por proyecto,
// cuáles de los 4 builtin y/o cuáles propiedades capturadas del IFC
// forman la clave — mínimo 2 (con 1 solo campo es "filtrar por una
// propiedad", no un criterio compuesto, validado en el schema Zod).

export type ElementoConjuntoBuiltinField = "file_name" | "global_id" | "tag" | "partida_code";

// Catálogo fijo de los 4 builtin — sirve tanto para el catálogo de
// campos disponibles (available-fields) como para poner una etiqueta
// legible a cada uno (ej. en ElementoConjuntoProblema.faltantes).
export const ELEMENTO_CONJUNTO_BUILTIN_LABELS: Record<ElementoConjuntoBuiltinField, string> = {
    file_name: "Archivo",
    global_id: "GUID",
    tag: "Tag",
    partida_code: "Código de partida",
};

export interface ElementoConjuntoFieldRow {
    position: number;
    field_type: "builtin" | "property";
    builtin_field: ElementoConjuntoBuiltinField | null;
    property_set: string | null;
    property_name: string | null;
}

export interface ElementoConjuntoConfigRow {
    project_id: number;
    updated_at: Date;
    updated_by: number | null;
}

export interface ElementoConjuntoConfigFull extends ElementoConjuntoConfigRow {
    fields: ElementoConjuntoFieldRow[];
}

// Catálogo de "de dónde se puede sacar un valor para la clave" — los 4
// builtin (siempre los mismos) + las property_set/property_name que
// EXISTAN en algún ifc_file vigente (is_current=true) del proyecto,
// juntando (UNION) las de todos los documentos aunque sean de
// especialidades distintas.
export interface AvailableElementoConjuntoFields {
    builtin: { builtin_field: ElementoConjuntoBuiltinField; label: string }[];
    ifc_properties: { property_set: string; property_name: string }[];
}

// Etiqueta legible de un campo — para el catálogo, para eco en la
// respuesta del reporte (campos_clave) y para los "faltantes" de cada
// elemento con problema.
export const etiquetaCampoElementoConjunto = (field: ElementoConjuntoFieldRow): string => {
    if (field.field_type === "builtin") return ELEMENTO_CONJUNTO_BUILTIN_LABELS[field.builtin_field!];
    return field.property_set ? `${field.property_set}::${field.property_name}` : field.property_name!;
};
