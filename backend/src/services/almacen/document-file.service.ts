// Archivo físico (escaneo/foto) de un documento de Almacén: patrón común a
// requerimientos y a los documentos siguientes del roadmap
// (docs/almacen-ingreso-productos/05-roadmap.md, regla transversal 9).
// El binario vive en `files` (módulo almacen); el documento guarda file_id.
// Regla: no queda un archivo sin dueño — reemplazar o quitar el archivo de un
// documento (y darlo de baja) ELIMINA el archivo anterior: la fila dentro de
// la misma transacción del cambio, los bytes DESPUÉS del COMMIT.
import fs from "node:fs";
import type { Pool, PoolClient } from "pg";
import { AppError } from "../../models/errors/app-error.js";
import { DOCUMENT_FILE_ERRORS } from "../../models/errors/almacen/document-file.errors.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";

// Tablas de documentos que guardan file_id. Cada documento nuevo con archivo
// se suma acá: es lo que impide adjuntar un mismo archivo a dos documentos
// de tablas distintas. Nombres fijos del servidor (nunca entrada del usuario).
const DOCUMENT_FILE_TABLES = ["purchase_requisitions"];

export interface FileBytes {
    file_path: string;
    thumbnail_path: string | null;
}

// El archivo debe existir, ser de este proyecto, ser del módulo Almacén y
// no estar ya adjunto a otro documento.
export const assertFileAttachable = async (
    client: Pool | PoolClient, projectId: number, fileId: number
): Promise<void> => {
    const { rowCount } = await client.query(
        `SELECT 1 FROM files f INNER JOIN modules m ON m.module_id = f.module_id
        WHERE f.file_id = $1 AND f.project_id = $2 AND m.code = $3`,
        [fileId, projectId, ALMACEN_MODULE_CODE]
    );
    if (rowCount === 0) throw new AppError(DOCUMENT_FILE_ERRORS.FILE_NOT_FOUND);

    for (const table of DOCUMENT_FILE_TABLES) {
        const used = await client.query(`SELECT 1 FROM ${table} WHERE file_id = $1`, [fileId]);
        if (used.rowCount) throw new AppError(DOCUMENT_FILE_ERRORS.FILE_ALREADY_ATTACHED);
    }
};

// Borra la fila de `files` (ya desvinculada del documento) y devuelve las
// rutas para borrar los bytes cuando la transacción haga COMMIT.
export const deleteFileRow = async (client: PoolClient, fileId: number): Promise<FileBytes | null> => {
    const { rows } = await client.query<FileBytes>(
        `DELETE FROM files WHERE file_id = $1 RETURNING file_path, thumbnail_path`, [fileId]
    );
    return rows[0] ?? null;
};

export const removeFileBytes = async (file: FileBytes | null): Promise<void> => {
    if (!file) return;
    await fs.promises.rm(file.file_path, { force: true });
    if (file.thumbnail_path) await fs.promises.rm(file.thumbnail_path, { force: true });
};
