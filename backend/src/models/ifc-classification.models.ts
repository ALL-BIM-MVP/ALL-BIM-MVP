export type IfcClassificationMode = "norma" | "manual";

export interface IfcClassificationFieldRow {
    slot: number;
    code_property_set: string | null;
    code_property_name: string;
    description_property_set: string | null;
    description_property_name: string | null;
    unit_property_set: string | null;
    unit_property_name: string | null;
}

// mode y property_prefix son DOS preguntas independientes (ver
// docs/roadmap-modulos-y-permisos.md, Fase 4) — un proyecto puede
// clasificar contra la norma Y filtrar sus propiedades por prefijo al
// mismo tiempo. Por eso cada uno tiene su propio *_locked — no hay un
// "locked" grupal, "bloquear todo" es responsabilidad del frontend
// (mandar los dos PUT), no un concepto del backend.
export interface IfcClassificationConfigRow {
    project_id: number;
    mode: IfcClassificationMode;
    mode_locked: boolean;
    property_prefix: string | null;
    property_prefix_locked: boolean;
    updated_at: Date;
    updated_by: number | null;
}

export interface IfcClassificationConfigFull extends IfcClassificationConfigRow {
    // v1: siempre 0 o 1 elemento (slot=1) — queda como array ya desde
    // ahora para no romper el contrato del lado del frontend cuando se
    // habilite soportar varios slots (Fase 4, ver roadmap).
    fields: IfcClassificationFieldRow[];
}

// Lo que efectivamente se usó para clasificar UNA versión puntual — se
// guarda tal cual (snapshot, no referencia viva) en
// ifc_files.classification_config_used al terminar de procesar.
// SIEMPRE se guarda un objeto (nunca null) — mode y property_prefix se
// resuelven de forma independiente, así que incluso "todo por
// defecto" (norma, sin prefijo) es un estado válido y snapshoteable.
// Los 6 campos de propiedad solo tienen valor real cuando mode='manual'.
export interface IfcClassificationSnapshot {
    mode: IfcClassificationMode;
    property_prefix: string | null;
    code_property_set: string | null;
    code_property_name: string | null;
    description_property_set: string | null;
    description_property_name: string | null;
    unit_property_set: string | null;
    unit_property_name: string | null;
}
