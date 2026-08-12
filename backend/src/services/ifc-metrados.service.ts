import pool from "../db/database.js";
import { AppError } from "../models/errors/app-error.js";
import { FILE_ERRORS } from "../models/errors/files.errors.js";
import { IFC_METRADOS_ERRORS } from "../models/errors/ifc-metrados.errors.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import type { IfcFileIdParam, ProcessIfcMetradosQuery } from "../schemas/ifc-metrados.schema.js";
import { transformIfcFileStatus, type IfcFileStatusFull, type IfcFileStatusRow } from "../models/ifc-files.models.js";
import { assertProjectAccess, saveFileService } from "./files.service.js";
import { runIfcProcessing } from "./ifc-processing-runner.js";

const UNIQUE_VIOLATION = "23505";

interface DecisionResult {
    shouldSpawn: boolean;
    row: IfcFileStatusRow;
}

// Resuelve, de forma atómica, si hay que (re)lanzar el procesamiento o
// no. El SELECT ... FOR UPDATE serializa dos requests casi simultáneas
// sobre el MISMO ifc_file_id ya existente (la segunda espera a que la
// primera haga commit, y cuando puede leer ya ve status='processing').
// Para la primera vez (fila todavía no existe), la propia PK de
// ifc_files hace de guarda: si dos requests intentan crearla a la vez,
// una gana y la otra recibe una violación de unicidad, que se atrapa
// abajo y se resuelve leyendo el estado que dejó la ganadora — sin
// relanzar dos veces.
const decideProcessingState = async (fileId: number, force: boolean): Promise<DecisionResult> => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const existing = await client.query<IfcFileStatusRow>(
            `SELECT ifc_file_id, status, schema_version, processed_at, error_message
            FROM ifc_files WHERE ifc_file_id = $1 FOR UPDATE`,
            [fileId]
        );

        if (existing.rowCount === 0) {
            try {
                const inserted = await client.query<IfcFileStatusRow>(
                    `INSERT INTO ifc_files (ifc_file_id, status)
                    VALUES ($1, 'processing')
                    RETURNING ifc_file_id, status, schema_version, processed_at, error_message`,
                    [fileId]
                );
                await client.query("COMMIT");
                return { shouldSpawn: true, row: inserted.rows[0]! };
            } catch (error) {
                await client.query("ROLLBACK");
                if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
                    const current = await pool.query<IfcFileStatusRow>(
                        `SELECT ifc_file_id, status, schema_version, processed_at, error_message
                        FROM ifc_files WHERE ifc_file_id = $1`,
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
            RETURNING ifc_file_id, status, schema_version, processed_at, error_message`,
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
    fileIdFromBody: number | undefined,
    multerFile: Express.Multer.File | undefined,
    { force }: ProcessIfcMetradosQuery
): Promise<ProcessIfcMetradosResult> => {

    await assertProjectAccess(projectId, user.user_id);

    let fileId: number;
    let filePath: string;

    if (multerFile) {
        const saved = await saveFileService(user, { projectId }, "ifc", multerFile);
        fileId = saved.file_id;
        filePath = multerFile.path;
    } else if (fileIdFromBody !== undefined) {
        const { rows } = await pool.query<{ file_path: string; file_type: string }>(
            `SELECT file_path, file_type FROM files WHERE file_id = $1 AND project_id = $2`,
            [fileIdFromBody, projectId]
        );
        const file = rows[0];
        if (!file) throw new AppError(FILE_ERRORS.FILE_NOT_FOUND);
        if (file.file_type !== "ifc") throw new AppError(IFC_METRADOS_ERRORS.FILE_NOT_IFC);
        fileId = fileIdFromBody;
        filePath = file.file_path;
    } else {
        throw new AppError(IFC_METRADOS_ERRORS.FILE_REQUIRED);
    }

    const { shouldSpawn, row } = await decideProcessingState(fileId, force ?? false);

    if (shouldSpawn) {
        void runIfcProcessing(fileId, filePath);
    }

    return { status: transformIfcFileStatus(row), justStarted: shouldSpawn };
};

export const getIfcFileStatusService = async (
    user: DecodedToken, { ifcFileId }: IfcFileIdParam
): Promise<IfcFileStatusFull> => {

    const { rows } = await pool.query<IfcFileStatusRow & { project_id: number }>(
        `SELECT i.ifc_file_id, i.status, i.schema_version, i.processed_at, i.error_message, f.project_id
        FROM ifc_files i
        INNER JOIN files f ON f.file_id = i.ifc_file_id
        WHERE i.ifc_file_id = $1`,
        [ifcFileId]
    );

    const row = rows[0];
    if (!row) throw new AppError(IFC_METRADOS_ERRORS.STATUS_NOT_FOUND);

    await assertProjectAccess(row.project_id, user.user_id);

    // project_id solo se pidió para validar el acceso — no es parte del
    // contrato de salida, así que no se pasa tal cual (transformIfcFileStatus
    // es una identidad y lo hubiera dejado pasar igual).
    const { project_id: _projectId, ...status } = row;
    return transformIfcFileStatus(status);
};
