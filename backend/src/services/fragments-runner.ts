import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { IfcImporter } from "@thatopen/fragments";
import pool from "../db/database.js";
import { UPLOADS_DIR } from "../middlewares/upload.midleware.js";
import { computeChecksum } from "./files.service.js";
import { acquireSlot, releaseSlot } from "./ifc-processing-runner.js";

// ------------------------------------------------------------------
// Fase 2 de la migración del visor a ThatOpen (ver
// docs/roadmap/migracion-visor-thatopen-backend.md, B1) — genera un
// archivo .frag (formato Fragments) a partir de un IFC ya procesado,
// y lo guarda como una fila más de `files`, con
// `generated_from_ifc_file_id` apuntando al IFC de origen — MISMO
// patrón exacto que ya usa la exportación a Excel
// (ifc-excel-export.service.ts:413-417), no un mecanismo nuevo.
//
// Se llama fire-and-forget desde runIfcProcessing (B2), DESPUÉS de
// que insertarResultado ya dejó ifc_files.status='done' — si esto
// falla, el metrado/clasificación ya quedó bien guardado igual: esto
// es puramente una optimización del visor, nunca debe tumbar ni
// ensuciar el resultado del procesamiento real (por eso nunca lanza
// hacia arriba, solo loguea).
// ------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// backend/dist/services -> backend/dist -> backend -> node_modules/web-ifc
// (web-ifc ya está en backend/package.json, y trae los .wasm consigo —
// @thatopen/fragments lo usa como peer dependency por debajo,
// confirmado en el spike que resuelve limpio con esta misma forma de
// apuntar el path).
const WEB_IFC_WASM_DIR = path.resolve(__dirname, "..", "..", "node_modules", "web-ifc") + "/";

interface FileOwnerRow {
    project_id: number;
    uploaded_by: number;
}

/**
 * Convierte el IFC ya procesado (ifcFilePath) a Fragments y lo
 * persiste como un `files` nuevo, encadenado al IFC de origen. No
 * lanza hacia arriba — cualquier error se loguea y la función vuelve
 * silenciosa (ver comentario de arriba).
 */
export const generateFragmentsForIfcFile = async (
    ifcFileId: number, ifcFilePath: string
): Promise<void> => {
    try {
        // El reproceso (force=true) reusa el MISMO ifc_file_id, mismos
        // bytes en disco — la conversión es una función determinística
        // del contenido del IFC, nunca de la clasificación, así que
        // regenerar en cada reproceso sería gastar CPU real sin ningún
        // cambio real de resultado. Si ya existe un .frag para este
        // ifc_file_id, no se toca — solo una versión NUEVA de verdad
        // (Fase 3, otro ifc_file_id) dispara una conversión nueva.
        const { rows: existingRows } = await pool.query<{ file_id: string }>(
            `SELECT file_id FROM files WHERE generated_from_ifc_file_id = $1 AND file_type = 'fragments'`,
            [ifcFileId]
        );
        if (existingRows.length > 0) return;

        const { rows } = await pool.query<FileOwnerRow>(
            `SELECT project_id, uploaded_by FROM files WHERE file_id = $1`,
            [ifcFileId]
        );
        const owner = rows[0];
        if (!owner) {
            console.error(`[fragments-runner] no se encontró la fila de files (ifc_file_id=${ifcFileId}), se omite la generación de Fragments.`);
            return;
        }

        // Reusa el mismo semáforo que ya limita cuántos subprocesos de
        // Python corren a la vez — esta conversión también usa CPU real
        // (15-25s medidos), no debería sumarse sin límite aparte.
        await acquireSlot();
        try {
            const bytes = await fs.readFile(ifcFilePath);

            const importer = new IfcImporter();
            importer.wasm = { path: WEB_IFC_WASM_DIR, absolute: true };

            const fragBytes = await importer.process({ bytes: new Uint8Array(bytes), raw: false });

            const dir = path.join(UPLOADS_DIR, String(owner.project_id));
            fsSync.mkdirSync(dir, { recursive: true });
            const fileName = `${randomUUID()}-fragments.frag`;
            const filePath = path.join(dir, fileName);
            await fs.writeFile(filePath, fragBytes);

            const checksum = await computeChecksum(filePath);
            const stat = await fs.stat(filePath);

            await pool.query(
                `INSERT INTO
                    files(project_id, file_type, name, file_path, file_size, checksum, mime_type, uploaded_by, generated_from_ifc_file_id)
                VALUES
                    ($1, 'fragments', $2, $3, $4, $5, $6, $7, $8)`,
                [
                    owner.project_id, fileName, filePath, stat.size, checksum,
                    "application/octet-stream",
                    owner.uploaded_by, ifcFileId,
                ]
            );
        } finally {
            releaseSlot();
        }
    } catch (error) {
        console.error(`[fragments-runner] fallo generando Fragments (ifc_file_id=${ifcFileId}):`, error);
    }
};
