import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Request } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Exportado: ifc-processing-runner.ts lo reusa para validar que el
// filePath que le pasan quede dentro de este directorio antes de
// mandarlo a un subprocess. TODO lo de acá abajo (proyectos/:id/*) es
// PRIVADO — solo se sirve autenticado, vía GET /api/files/:id/content
// (que valida dueño-o-miembro), NUNCA montado como estático público.
export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "..", "..", "uploads");

// Subcarpeta aparte, chica, EXCLUSIVAMENTE para lo que sí está pensado
// para ser público (portadas de proyecto + la imagen por defecto) — ver
// index.ts, que monta SOLO esta carpeta como estática, nunca UPLOADS_DIR
// entero. Mantenerla físicamente separada de uploads/<projectId>/ (donde
// viven los archivos/documentos reales) es la protección real: aunque
// alguien adivine o filtre una URL pública, ahí nunca puede haber un
// archivo privado, porque nunca se guarda nada privado en esta carpeta.
export const PUBLIC_UPLOADS_DIR = path.join(UPLOADS_DIR, "public");

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

const privateStorage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const rawProjectId = typeof req.params.projectId === "string" ? req.params.projectId : "";
    const projectId = /^\d+$/.test(rawProjectId) ? rawProjectId : "invalid";
    const dir = path.join(UPLOADS_DIR, projectId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${randomUUID()}-${safeName}`);
  },
});

export const uploadSingleFile = multer({
  storage: privateStorage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
}).single("file");

// Mismo esquema de nombre de archivo, pero guarda directo bajo
// PUBLIC_UPLOADS_DIR/covers/:projectId/ — usado SOLO por
// PUT /projects/:id/image (ver project-images.controller.ts). Nunca
// mezclar con uploadSingleFile: si un archivo "privado" cayera acá por
// error, quedaría público sin auth ni chequeo de membresía.
const publicCoverStorage = multer.diskStorage({
  destination: (req: Request, _file, cb) => {
    const rawProjectId = typeof req.params.projectId === "string" ? req.params.projectId : "";
    const projectId = /^\d+$/.test(rawProjectId) ? rawProjectId : "invalid";
    const dir = path.join(PUBLIC_UPLOADS_DIR, "covers", projectId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${randomUUID()}-${safeName}`);
  },
});

export const uploadCoverImage = multer({
  storage: publicCoverStorage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
}).single("file");
