import type { FileType } from "../schemas/file.schema.js";
import type { IfcProcessingStatus } from "./ifc-files.models.js";
import { buildSignedFileUrl } from "../utils/file-signing.js";

// Sin imagen a propósito — es atribución (quién subió el archivo), no
// una vitrina de la persona (ver docs/roadmap-modulos-y-permisos.md,
// Fase 1).
interface FileUploader {
    user_id : number;
    user_name : string;
    user_last_name : string | null;
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
    // Solo relevante para file_type='image' — null si no se pudo generar
    // la miniatura al subir (ver utils/thumbnail.ts) o si el archivo no
    // es una imagen. Cuando no es null, es una URL FIRMADA de corta
    // duración (ver utils/file-signing.ts) lista para pintar directo en
    // <img src="...">, sin Authorization — se recalcula en cada GET de
    // la lista (no se guarda, no tiene sentido cachearla server-side
    // porque vence a los pocos minutos). El path físico real
    // (thumbnail_path) nunca sale de acá.
    thumbnail_url : string | null;
};

// thumbnail_path viaja crudo desde la BD hasta acá (no forma parte de
// FileBase a propósito, es interno) — transformFileToFull lo convierte
// en la URL firmada (thumbnail_url) antes de que el dato salga al
// cliente.
export interface FileRow extends Omit<FileBase, "thumbnail_url"> {
    user_id : number;
    user_name : string;
    user_last_name : string | null;
    user_email : string;
    thumbnail_path : string | null;
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
        thumbnail_url: f.thumbnail_path !== null ? buildSignedFileUrl(f.file_id, "thumbnail") : null,
        uploaded_by: {
            user_id: f.user_id,
            user_name: f.user_name,
            user_last_name: f.user_last_name,
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

// Análogo a FileDownload pero para la miniatura — thumbnail_path nunca
// es null acá (getFileThumbnailService ya filtró ese caso con
// THUMBNAIL_NOT_AVAILABLE antes de devolver esto).
export interface FileThumbnailDownload {
    file_id : number;
    project_id : number;
    thumbnail_path : string;
};
