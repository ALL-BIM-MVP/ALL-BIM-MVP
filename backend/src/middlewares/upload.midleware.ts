import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Request } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Exportado: ifc-processing-runner.ts lo reusa para validar que el
// filePath que le pasan quede dentro de este directorio antes de
// mandarlo a un subprocess.
export const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, "..", "..", "uploads");

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

const storage = multer.diskStorage({
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
  storage,
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
}).single("file");
