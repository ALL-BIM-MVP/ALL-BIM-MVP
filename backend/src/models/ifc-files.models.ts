import type { IfcClassificationSnapshot } from "./ifc-classification.models.js";

export type IfcProcessingStatus = "processing" | "done" | "error";

export interface IfcFileStatusRow {
    ifc_file_id: number;
    ifc_document_id: number;
    version_number: number;
    is_current: boolean;
    status: IfcProcessingStatus;
    schema_version: string | null;
    processed_at: Date | null;
    error_message: string | null;
    // Fase 4 — snapshot de con qué se clasificó ESTA versión (copia
    // congelada, no una referencia viva a la config del proyecto, ver
    // ifc-classification.service.ts). NULL si se procesó en modo
    // 'norma' (no hay nada que snapshotear ahí).
    classification_config_used: IfcClassificationSnapshot | null;
}

export type IfcFileStatusFull = IfcFileStatusRow;

export const transformIfcFileStatus = (row: IfcFileStatusRow): IfcFileStatusFull => row;
