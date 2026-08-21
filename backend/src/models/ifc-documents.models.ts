export interface IfcSpecialtyRow {
    ifc_specialty_id: number;
    code: string;
    name: string;
    is_active: boolean;
}

export type IfcSpecialtyFull = IfcSpecialtyRow;

export const transformSpecialty = (row: IfcSpecialtyRow): IfcSpecialtyFull => row;

// Una fila por VERSIÓN (ifc_files) de un documento — lo que necesita el
// frontend para armar el selector "reemplazar esta versión" (Fase 3,
// flujo manual con confirmación explícita, ver
// docs/roadmap-modulos-y-permisos.md). name/mime/file_size vienen de
// "files", el resto de "ifc_files".
export interface IfcDocumentVersionRow {
    ifc_file_id: number;
    version_number: number;
    is_current: boolean;
    status: "processing" | "done" | "error";
    error_message: string | null;
    processed_at: Date | null;
    uploaded_at: Date;
    name: string;
    file_size: string | null;
    uploaded_by: number;
    uploader_name: string;
    uploader_last_name: string | null;
}

export interface IfcDocumentRow {
    ifc_document_id: number;
    project_id: number;
    name: string;
    specialty_id: number | null;
    specialty_code: string | null;
    specialty_name: string | null;
    created_at: Date;
    created_by: number;
}

export interface IfcDocumentFull extends IfcDocumentRow {
    versions: IfcDocumentVersionRow[];
}
