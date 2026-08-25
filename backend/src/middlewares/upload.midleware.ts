import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
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

// Foto de perfil — memoryStorage a propósito, no diskStorage: el
// archivo SIEMPRE se reprocesa con sharp antes de guardarse en algún
// lado (ver utils/avatar.ts, recorte a 256×256), así que nunca hace
// falta tocar disco con el buffer crudo ni limpiar un temporal
// después — se lee una vez en memoria, se transforma, se escribe la
// versión final directo. Límite más chico que el general (200MB): es
// una foto de perfil, no un archivo de proyecto.
const AVATAR_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const uploadProfilePicture = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_UPLOAD_BYTES },
}).single("file");

// Dry-run de clasificación manual (consolidación punto 5, ver
// ifc-metrados.service.ts) — el archivo es solo para PROBAR una config
// antes de subirlo/procesarlo en serio, nunca se guarda de verdad.
// diskStorage apuntando al tmp del SO (NUNCA UPLOADS_DIR) — así queda
// clarísimo por la sola ubicación que esto no es un archivo real del
// proyecto, y evita el riesgo de memoria de bufferear en RAM un IFC de
// hasta 200MB (memoryStorage) en cada dry-run. El service lo borra en
// un finally apenas termina de leerlo — nunca queda ahí más que el
// tiempo de un request.
const dryRunStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, os.tmpdir()),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `ifc-dry-run-${randomUUID()}-${safeName}`);
  },
});

export const uploadDryRunFile = multer({
  storage: dryRunStorage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
}).single("file");
