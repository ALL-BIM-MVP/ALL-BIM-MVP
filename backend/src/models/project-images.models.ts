import path from "node:path";
import { PUBLIC_UPLOADS_DIR } from "../middlewares/upload.midleware.js";

// Imagen fija que se usa cuando un proyecto no tiene portada propia —
// exportada acá (no en project-images.service.ts) porque
// projects.models.ts también la necesita para armar el campo
// cover_image de CADA proyecto en los GET, sin depender del service.
// Vive bajo PUBLIC_UPLOADS_DIR (uploads/public/), NO en uploads/
// directo — esa es la carpeta que index.ts monta como estática
// pública, separada a propósito de uploads/<projectId>/ donde viven
// los archivos/documentos reales (ver comentario en upload.midleware.ts).
export const DEFAULT_COVER_IMAGE_PATH = path.join(PUBLIC_UPLOADS_DIR, "default", "project-deafault.jpg");
export const DEFAULT_COVER_MIME_TYPE = "image/jpeg";
const DEFAULT_COVER_NAME = "project-deafault.jpg";

// Lo mínimo para servir bytes de una imagen (portada real o la de
// por defecto) — mismo criterio que FileDownload en files.models.ts,
// no expone nada más al cliente.
export interface ProjectImageContent {
    file_path : string;
    mime_type : string | null;
};

// Lo que viaja embebido en CADA proyecto de GET /projects y
// GET /projects/:id — "traiga la imagen siempre": nunca es null, si no
// hay portada propia cae en la de por defecto acá mismo (no es
// responsabilidad del frontend distinguir esos dos casos, no le hace
// falta). Sin file_id: la portada no es una fila de `files` (vive en
// columnas de `projects`, ver database/schema.sql), no hay ningún id que
// exponer.
export interface ProjectCoverImage {
    name : string;
    mime_type : string | null;
    // Ruta pública servida por el mount estático de /uploads (ver
    // index.ts) — SIN auth a propósito, para que funcione directo en
    // un <img src="..."> de una lista de proyectos sin fetch()+blob por
    // cada tarjeta. Nunca es el archivo/documento real de un proyecto
    // (eso sigue protegido, ver GET /files/:id/content), solo la
    // portada visual.
    url : string;
};

// Respuesta de PUT /projects/:id/image — mismo shape que ProjectCoverImage
// (así el frontend puede pisar directo su cover_image en memoria sin
// tener que re-pedir el proyecto entero) más file_size, que solo
// importa justo después de subir.
export interface ProjectCoverImageInfo extends ProjectCoverImage {
    file_size : number | null;
};

// El file_path de una portada real siempre cae DENTRO de
// PUBLIC_UPLOADS_DIR (lo guarda ahí el multer dedicado, uploadCoverImage
// en upload.midleware.ts) — esto solo lo reexpresa como ruta pública
// bajo /uploads. path.relative en vez de un simple prefijo porque
// UPLOADS_DIR puede venir absoluto o relativo según el .env de cada
// entorno (ver backend/.env.example). Si algún día se le pasa por error
// el file_path de un archivo PRIVADO (fuera de PUBLIC_UPLOADS_DIR), el
// resultado da un path.relative con "../" — vale la pena no confiar en
// esta función para nada que no sea explícitamente público.
export const toPublicUploadsUrl = (filePath : string) : string => {
    const relative = path.relative(PUBLIC_UPLOADS_DIR, filePath).split(path.sep).join("/");
    return `/uploads/${relative}`;
};

export const buildDefaultCoverImage = () : ProjectCoverImage => ({
    name: DEFAULT_COVER_NAME,
    mime_type: DEFAULT_COVER_MIME_TYPE,
    url: toPublicUploadsUrl(DEFAULT_COVER_IMAGE_PATH),
});
