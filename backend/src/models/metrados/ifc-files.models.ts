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

// B3 de la migración del visor a ThatOpen (ver
// docs/roadmap/migracion-visor-thatopen-backend.md) — GET
// /ifc-files/:id (getIfcFileStatusService) suma si ya existe un
// Fragments generado para este archivo. BIGINT de Postgres viaja
// como string (ver docs/api-contract.md, punto 0) — null si todavía
// no se generó. Separado de IfcFileStatusFull a propósito: el resto
// de los usos de esa forma (ej. la respuesta de POST
// /ifc-metrados/process, justo al lanzar el procesamiento) no
// necesitan este dato.
export interface IfcFileStatusWithFragments extends IfcFileStatusFull {
    fragments_file_id: string | null;
}
