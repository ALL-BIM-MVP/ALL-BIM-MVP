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
}

export type IfcFileStatusFull = IfcFileStatusRow;

export const transformIfcFileStatus = (row: IfcFileStatusRow): IfcFileStatusFull => row;
