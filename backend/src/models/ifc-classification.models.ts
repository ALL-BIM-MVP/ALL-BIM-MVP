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

export interface IfcClassificationConfigRow {
    project_id: number;
    mode: IfcClassificationMode;
    property_prefix: string | null;
    locked: boolean;
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
// ifc_files.classification_config_used al terminar de procesar. Mismo
// shape que le llega al pipeline de Python (ver
// ifc-processing-runner.ts) menos el campo mode, que ahí siempre es
// "manual" (si fuera "norma" no se snapshotea nada, la columna queda
// NULL — ver ifc-classification.service.ts).
export interface IfcClassificationSnapshot {
    mode: "manual";
    property_prefix: string;
    code_property_set: string | null;
    code_property_name: string;
    description_property_set: string | null;
    description_property_name: string | null;
    unit_property_set: string | null;
    unit_property_name: string | null;
}
