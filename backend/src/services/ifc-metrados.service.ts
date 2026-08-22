import fs from "node:fs/promises";
import pool from "../db/database.js";
import { AppError } from "../models/errors/app-error.js";
import { FILE_ERRORS } from "../models/errors/files.errors.js";
import { IFC_METRADOS_ERRORS } from "../models/errors/ifc-metrados.errors.js";
import { IFC_DOCUMENTS_ERRORS } from "../models/errors/ifc-documents.errors.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import type { IfcFileIdParam, ProcessIfcMetradosBody, ProcessIfcMetradosQuery } from "../schemas/ifc-metrados.schema.js";
import { transformIfcFileStatus, type IfcFileStatusFull, type IfcFileStatusRow } from "../models/ifc-files.models.js";
import { saveFileService } from "./files.service.js";
import { assertModulePermission } from "./project-access.service.js";
import { runIfcProcessing } from "./ifc-processing-runner.js";
import { resolveClassificationForProcessing } from "./ifc-classification.service.js";
import type { IfcClassificationSnapshot } from "../models/ifc-classification.models.js";

// Todo esto es trabajo del módulo METRADOS BIM — único módulo
// funcional hoy (Fase 2, ver docs/roadmap-modulos-y-permisos.md). El
// día que otro módulo también procese IFC, esta constante deja de
// alcanzar y hay que resolver el módulo real por contexto.
const METRADOS_MODULE_CODE = "metrados";

const UNIQUE_VIOLATION = "23505";

const STATUS_COLUMNS = `ifc_file_id, ifc_document_id, version_number, is_current, status, schema_version, processed_at, error_message, classification_config_used`;

interface DecisionResult {
    shouldSpawn: boolean;
    row: IfcFileStatusRow;
}

// Contexto de documento/versión (Fase 3) — solo se usa cuando hay que
// CREAR una fila ifc_files nueva (primera vez que se procesa este
// file_id). Si la fila ya existe (reproceso/force), decideProcessingState
// lo ignora por completo: el documento/versión de esa fila ya está
// fijado desde que se creó.
export interface NewIfcFileContext {
    projectId: number;
    createdBy: number;
    documentName: string;
    replacesIfcDocumentId: number | undefined;
    specialtyId: number | undefined;
}

// Resuelve, de forma atómica, si hay que (re)lanzar el procesamiento o
// no. El SELECT ... FOR UPDATE serializa dos requests casi simultáneas
// sobre el MISMO ifc_file_id ya existente (la segunda espera a que la
// primera haga commit, y cuando puede leer ya ve status='processing').
// Para la primera vez (fila todavía no existe), acá también se resuelve
// a qué ifc_documents pertenece esta versión — ver resolveNewFileDocument.
const decideProcessingState = async (
    fileId: number, force: boolean, newFileContext: NewIfcFileContext
): Promise<DecisionResult> => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const existing = await client.query<IfcFileStatusRow>(
            `SELECT ${STATUS_COLUMNS} FROM ifc_files WHERE ifc_file_id = $1 FOR UPDATE`,
            [fileId]
        );

        if (existing.rowCount === 0) {
            try {
                const { ifcDocumentId, versionNumber } = await resolveNewFileDocument(client, newFileContext);

                // is_current SIEMPRE arranca en false, incluso para la
                // v1 de un documento recién creado — recién pasa a true
                // cuando insertarResultado (ifc-processing-runner.ts)
                // confirma que el procesamiento terminó bien. Así, si
                // esta corrida falla, el documento simplemente se queda
                // sin versión vigente (o con la vieja intacta, si es un
                // reemplazo) en vez de arriesgar el índice único parcial
                // idx_un_ifc_document_current con dos filas en 'true'.
                const inserted = await client.query<IfcFileStatusRow>(
                    `INSERT INTO ifc_files (ifc_file_id, ifc_document_id, version_number, is_current, status)
                    VALUES ($1, $2, $3, false, 'processing')
                    RETURNING ${STATUS_COLUMNS}`,
                    [fileId, ifcDocumentId, versionNumber]
                );
                await client.query("COMMIT");
                return { shouldSpawn: true, row: inserted.rows[0]! };
            } catch (error) {
                await client.query("ROLLBACK");
                if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
                    const current = await pool.query<IfcFileStatusRow>(
                        `SELECT ${STATUS_COLUMNS} FROM ifc_files WHERE ifc_file_id = $1`,
                        [fileId]
                    );
                    return { shouldSpawn: false, row: current.rows[0]! };
                }
                throw error;
            }
        }

        const row = existing.rows[0]!;

        if (row.status === "processing") {
            await client.query("COMMIT");
            return { shouldSpawn: false, row };
        }
        if (row.status === "done" && !force) {
            await client.query("COMMIT");
            return { shouldSpawn: false, row };
        }

        // done + force=true, o status='error' (reintento automático).
        const updated = await client.query<IfcFileStatusRow>(
            `UPDATE ifc_files
                SET status = 'processing', error_message = NULL, processed_at = NULL
            WHERE ifc_file_id = $1
            RETURNING ${STATUS_COLUMNS}`,
            [fileId]
        );
        await client.query("COMMIT");
        return { shouldSpawn: true, row: updated.rows[0]! };
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    } finally {
        client.release();
    }
};

// Solo se llama desde la rama "la fila ifc_files no existe todavía" de
// decideProcessingState, en la MISMA transacción (client con lock ya
// tomado) — así el cómputo de version_number (MAX+1) y la validación
// del documento quedan serializados contra cualquier otra subida
// concurrente para el mismo documento.
const resolveNewFileDocument = async (
    client: import("pg").PoolClient, ctx: NewIfcFileContext
): Promise<{ ifcDocumentId: number; versionNumber: number }> => {

    if (ctx.replacesIfcDocumentId !== undefined) {
        const doc = await client.query(
            `SELECT ifc_document_id FROM ifc_documents WHERE ifc_document_id = $1 AND project_id = $2 FOR UPDATE`,
            [ctx.replacesIfcDocumentId, ctx.projectId]
        );
        if (doc.rowCount === 0) throw new AppError(IFC_DOCUMENTS_ERRORS.DOCUMENT_NOT_FOUND);

        // Evita que dos subidas de una nueva versión del MISMO
        // documento se crucen — el FOR UPDATE de arriba ya serializa la
        // creación, pero esto además da un error claro en vez de dejar
        // que la segunda espere en silencio.
        const inFlight = await client.query(
            `SELECT 1 FROM ifc_files WHERE ifc_document_id = $1 AND status = 'processing'`,
            [ctx.replacesIfcDocumentId]
        );
        if ((inFlight.rowCount ?? 0) > 0) throw new AppError(IFC_DOCUMENTS_ERRORS.VERSION_ALREADY_PROCESSING);

        const maxVersion = await client.query<{ max_version: string }>(
            `SELECT COALESCE(MAX(version_number), 0) AS max_version FROM ifc_files WHERE ifc_document_id = $1`,
            [ctx.replacesIfcDocumentId]
        );
        return { ifcDocumentId: ctx.replacesIfcDocumentId, versionNumber: Number(maxVersion.rows[0]!.max_version) + 1 };
    }

    if (ctx.specialtyId === undefined) throw new AppError(IFC_DOCUMENTS_ERRORS.SPECIALTY_REQUIRED);

    const specialty = await client.query(
        `SELECT 1 FROM ifc_specialties WHERE ifc_specialty_id = $1 AND is_active = true`,
        [ctx.specialtyId]
    );
    if (specialty.rowCount === 0) throw new AppError(IFC_DOCUMENTS_ERRORS.SPECIALTY_NOT_FOUND);

    const newDoc = await client.query<{ ifc_document_id: string }>(
        `INSERT INTO ifc_documents (project_id, name, specialty_id, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING ifc_document_id`,
        [ctx.projectId, ctx.documentName, ctx.specialtyId, ctx.createdBy]
    );
    return { ifcDocumentId: Number(newDoc.rows[0]!.ifc_document_id), versionNumber: 1 };
};

// Deshace un saveFileService exitoso cuando la creación del documento/
// versión (Fase 3) falla justo después — sin esto quedaría una fila
// "files" con bytes en disco que ningún endpoint puede reprocesar
// limpiamente (el próximo intento por file_id la encontraría sin
// ifc_files y con el mismo problema de specialty/replaces sin resolver).
const deleteOrphanUpload = async (fileId: number, filePath: string): Promise<void> => {
    await pool.query(`DELETE FROM files WHERE file_id = $1`, [fileId]).catch((error) => {
        console.error(`[ifc-metrados] no se pudo limpiar la fila files huérfana (file_id=${fileId}):`, error);
    });
    await fs.rm(filePath, { force: true }).catch(() => {});
};

export interface ProcessIfcMetradosResult {
    status: IfcFileStatusFull;
    // true = se acaba de encolar/lanzar el procesamiento (202). false =
    // ya había un estado vigente y no se relanzó nada (200) — puede ser
    // 'processing' ya en curso, o 'done' sin ?force=true.
    justStarted: boolean;
}

export const processIfcMetradosService = async (
    user: DecodedToken,
    { projectId }: ProjectIdParam,
    body: ProcessIfcMetradosBody,
    multerFile: Express.Multer.File | undefined,
    { force }: ProcessIfcMetradosQuery
): Promise<ProcessIfcMetradosResult> => {

    // "process" siempre — es la acción real de este endpoint. "upload"
    // además, solo si vino un archivo nuevo por multipart (la variante
    // por file_id reprocesa uno que ya estaba, no sube nada).
    await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "process");
    if (multerFile) {
        await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "upload");
    }

    let fileId: number;
    let filePath: string;
    let fileName: string;

    if (multerFile) {
        const saved = await saveFileService(user, { projectId }, "ifc", multerFile);
        fileId = saved.file_id;
        filePath = multerFile.path;
        fileName = saved.name;
    } else if (body.file_id !== undefined) {
        const { rows } = await pool.query<{ file_path: string; file_type: string; name: string }>(
            `SELECT file_path, file_type, name FROM files WHERE file_id = $1 AND project_id = $2`,
            [body.file_id, projectId]
        );
        const file = rows[0];
        if (!file) throw new AppError(FILE_ERRORS.FILE_NOT_FOUND);
        if (file.file_type !== "ifc") throw new AppError(IFC_METRADOS_ERRORS.FILE_NOT_IFC);
        fileId = body.file_id;
        filePath = file.file_path;
        fileName = file.name;
    } else {
        throw new AppError(IFC_METRADOS_ERRORS.FILE_REQUIRED);
    }

    const newFileContext: NewIfcFileContext = {
        projectId,
        createdBy: user.user_id,
        documentName: body.document_name ?? fileName,
        replacesIfcDocumentId: body.replaces_ifc_document_id,
        specialtyId: body.specialty_id,
    };

    let decision: DecisionResult;
    let classificationSnapshot: IfcClassificationSnapshot | null;
    try {
        // Se resuelve ANTES de decideProcessingState a propósito — si
        // vino un classification_override y la config del proyecto está
        // bloqueada (CONFIG_LOCKED), no queremos haber creado ya un
        // ifc_documents/ifc_files nuevo para un procesamiento que ni
        // siquiera va a arrancar.
        const resolved = await resolveClassificationForProcessing(projectId, body.classification_override);
        classificationSnapshot = resolved.snapshot;
        decision = await decideProcessingState(fileId, force ?? false, newFileContext);
    } catch (error) {
        // Si el archivo se acaba de subir por multipart y algo de lo de
        // arriba falló (ej. IFC_SPECIALTY_REQUIRED, CONFIG_LOCKED), no
        // dejamos una fila "files" huérfana sin ifc_files ni bytes
        // recuperables por ningún endpoint — se borra igual que si la
        // subida nunca hubiera pasado. Si vino por file_id (archivo ya
        // existente), no se toca nada, es el archivo del usuario.
        if (multerFile) await deleteOrphanUpload(fileId, filePath);
        throw error;
    }
    const { shouldSpawn, row } = decision;

    if (shouldSpawn) {
        void runIfcProcessing(fileId, filePath, classificationSnapshot);
    }

    return { status: transformIfcFileStatus(row), justStarted: shouldSpawn };
};

export const getIfcFileStatusService = async (
    user: DecodedToken, { ifcFileId }: IfcFileIdParam
): Promise<IfcFileStatusFull> => {

    const { rows } = await pool.query<IfcFileStatusRow & { project_id: number }>(
        `SELECT i.ifc_file_id, i.ifc_document_id, i.version_number, i.is_current,
            i.status, i.schema_version, i.processed_at, i.error_message,
            i.classification_config_used, f.project_id
        FROM ifc_files i
        INNER JOIN files f ON f.file_id = i.ifc_file_id
        WHERE i.ifc_file_id = $1`,
        [ifcFileId]
    );

    const row = rows[0];
    if (!row) throw new AppError(IFC_METRADOS_ERRORS.STATUS_NOT_FOUND);

    await assertModulePermission(row.project_id, user.user_id, METRADOS_MODULE_CODE, "view");

    // project_id solo se pidió para validar el acceso — no es parte del
    // contrato de salida, así que no se pasa tal cual (transformIfcFileStatus
    // es una identidad y lo hubiera dejado pasar igual).
    const { project_id: _projectId, ...status } = row;
    return transformIfcFileStatus(status);
};

// Confirma que el ifc_file_id exista y que el usuario tenga el permiso
// pedido (default "view") sobre el módulo Metrados del proyecto dueño
// de ese archivo — mismo JOIN que getIfcFileStatusService, factorizado
// para que lo reusen los endpoints de partidas/elementos
// (metrado-partidas.service.ts) y el catálogo de columnas
// (templates.service.ts), que no necesitan el resto de columnas de
// ifc_files, solo confirmar el acceso.
export const assertIfcFileAccess = async (
    ifcFileId: number, userId: number, permissionCode: string = "view"
): Promise<void> => {
    const { rows } = await pool.query<{ project_id: number }>(
        `SELECT f.project_id
        FROM ifc_files i
        INNER JOIN files f ON f.file_id = i.ifc_file_id
        WHERE i.ifc_file_id = $1`,
        [ifcFileId]
    );

    const row = rows[0];
    if (!row) throw new AppError(IFC_METRADOS_ERRORS.STATUS_NOT_FOUND);

    await assertModulePermission(row.project_id, userId, METRADOS_MODULE_CODE, permissionCode);
};
