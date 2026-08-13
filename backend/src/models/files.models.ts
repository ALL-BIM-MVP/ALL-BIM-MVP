import type { FileType } from "../schemas/file.schema.js";
import type { IfcProcessingStatus } from "./ifc-files.models.js";

interface FileUploader {
    user_id : number;
    user_name : string;
    user_email : string;
};

export interface FileBase {
    file_id : number;
    project_id : number;
    file_type : FileType;
    name : string;
    file_size : number | null;
    checksum : string | null;
    mime_type : string | null;
    uploaded_at : Date;
    // Viene de un LEFT JOIN a ifc_files — para file_type != 'ifc', o un
    // ifc que nunca se mandó a procesar, ambos quedan null (NO false):
    // "nunca procesado" y "procesado y falló" son estados distintos que
    // el frontend necesita distinguir (botón "Procesar" vs "Reintentar"
    // + mostrar el error), un booleano processed:true/false los
    // confundiría a los dos en el mismo "false". ifc_error_message solo
    // trae algo cuando ifc_status='error' (mismo mensaje corto y
    // sanitizado que devuelve GET /ifc-files/:id, nunca el stack trace).
    ifc_status : IfcProcessingStatus | null;
    ifc_error_message : string | null;
};

export interface FileRow extends FileBase {
    user_id : number;
    user_name : string;
    user_email : string;
};

export interface FileFull extends FileBase {
    uploaded_by : FileUploader;
};

export const transformFileToFull = (f : FileRow) : FileFull => {
    return {
        file_id: f.file_id,
        project_id: f.project_id,
        file_type: f.file_type,
        name: f.name,
        file_size: f.file_size,
        checksum: f.checksum,
        mime_type: f.mime_type,
        uploaded_at: f.uploaded_at,
        ifc_status: f.ifc_status,
        ifc_error_message: f.ifc_error_message,
        uploaded_by: {
            user_id: f.user_id,
            user_name: f.user_name,
            user_email: f.user_email
        }
    };
};

// Lo mínimo necesario para servir los bytes de un archivo — no expone
// file_path al cliente (transformFileToFull tampoco lo hace), solo se
// usa server-side en el controller para leer del disco.
export interface FileDownload {
    file_id : number;
    project_id : number;
    name : string;
    file_path : string;
    mime_type : string | null;
};
