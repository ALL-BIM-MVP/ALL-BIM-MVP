import type { FileType } from "../schemas/file.schema.js";

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
