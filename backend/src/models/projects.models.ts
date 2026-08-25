
import type { ProjectCreate } from "../schemas/projects.schema.js";
import { buildDefaultCoverImage, toPublicUploadsUrl, type ProjectCoverImage } from "./project-images.models.js";

export interface Project extends ProjectCreate {
    project_id : number;
    created_at : Date;
    created_by : number;
};

// user_name/user_last_name, no image — es un campo de atribución
// (quién es dueño), no una vitrina de la persona (ver
// docs/roadmap-modulos-y-permisos.md, Fase 1).
export interface ProjectOwner {
    user_id : number;
    user_name : string;
    user_last_name : string | null;
    role_id : number;
};

// image_* salen de un LEFT JOIN a project_images+files (ver
// projects.service.ts) — todos null cuando el proyecto no tiene
// portada propia, transformProjectFull los reemplaza por la imagen de
// por defecto en ese caso ("traiga la imagen siempre", nunca null en
// la respuesta final).
export interface ProjectRow extends ProjectCreate, ProjectOwner {
    project_id : number;
    created_at : Date;
    image_file_id : string | null;
    image_path : string | null;
    image_name : string | null;
    image_mime_type : string | null;
};

export interface ProjectFull extends ProjectCreate {
    project_id: number;
    created_at: Date;
    owner : ProjectOwner;
    cover_image : ProjectCoverImage;
};

// Resumen de "info del proyecto" (GET /projects/:id, no la lista) —
// dos conteos simples, mismo criterio en los dos: solo lo que hay ALGO
// (sin filas en 0), sin desglosar versiones/historial. `ifc` cuenta
// DOCUMENTOS (ifc_documents), no filas de `files` — un documento con 3
// versiones sigue contando 1, la versión vieja no infla el número (ver
// projects.service.ts para el porqué). El resto de los tipos son
// conteo directo de `files` por `file_type` (sin desglose de
// procesado/pendiente ni de origen — a propósito, ver
// docs/resumen-proyecto-frontend.txt).
export interface SpecialtySummary {
    specialty_code : string;
    specialty_name : string;
    count : number;
};

export interface FileTypeSummary {
    file_type : string;
    count : number;
};

export interface ProjectDetail extends ProjectFull {
    specialties_summary : SpecialtySummary[];
    files_summary : FileTypeSummary[];
};

export const transformProjectFull = (p : ProjectRow) : ProjectFull => {
    return {
        project_id: p.project_id,
        name: p.name,
        description: p.description,
        location: p.location,
        client: p.client,
        contractor: p.contractor,
        start_date: p.start_date,
        end_date: p.end_date,
        created_at: p.created_at,
        owner: {
            user_id: p.user_id,
            user_name: p.user_name,
            user_last_name: p.user_last_name,
            role_id: p.role_id,
        },
        cover_image: p.image_file_id && p.image_path
            ? { file_id: p.image_file_id, name: p.image_name!, mime_type: p.image_mime_type, url: toPublicUploadsUrl(p.image_path) }
            : buildDefaultCoverImage(),
    };
};


