
import type { ProjectCreate } from "../schemas/projects.schema.js";
import { buildDefaultCoverImage, toPublicUploadsUrl, type ProjectCoverImage } from "./project-images.models.js";

export interface Project extends ProjectCreate {
    project_id : number;
    created_at : Date;
    created_by : number;
};

export interface ProjectOwner {
    user_id : number;
    user_name : string;
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
            role_id: p.role_id,
        },
        cover_image: p.image_file_id && p.image_path
            ? { file_id: p.image_file_id, name: p.image_name!, mime_type: p.image_mime_type, url: toPublicUploadsUrl(p.image_path) }
            : buildDefaultCoverImage(),
    };
};


