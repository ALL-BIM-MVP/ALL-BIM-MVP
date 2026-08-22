import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import {
    transformSpecialty,
    type IfcDocumentFull, type IfcDocumentRow, type IfcDocumentVersionRow, type IfcSpecialtyFull, type IfcSpecialtyRow,
} from "../models/ifc-documents.models.js";
import { assertModulePermission } from "./project-access.service.js";

// Mismo criterio que el resto del módulo Metrados (ver
// ifc-metrados.service.ts) — único módulo funcional hoy.
const METRADOS_MODULE_CODE = "metrados";

// Catálogo — no depende de ningún proyecto, cualquier cuenta
// autenticada puede leerlo (lo necesita el frontend para armar el
// selector de especialidad al crear un documento nuevo).
export const getIfcSpecialtiesService = async (): Promise<IfcSpecialtyFull[]> => {
    const { rows } = await pool.query<IfcSpecialtyRow>(
        `SELECT ifc_specialty_id, code, name, is_active
        FROM ifc_specialties
        WHERE is_active = true
        ORDER BY name`
    );
    return rows.map(transformSpecialty);
};

// Documentos IFC del proyecto + todas sus versiones — lo que necesita
// el frontend para el flujo manual de versionado (Fase 3): elegir "esto
// es una versión nueva de X" en vez de "esto es un documento nuevo".
export const listIfcDocumentsService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<IfcDocumentFull[]> => {

    await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "view");

    const documents = await pool.query<IfcDocumentRow>(
        `SELECT d.ifc_document_id, d.project_id, d.name,
            d.specialty_id, s.code AS specialty_code, s.name AS specialty_name,
            d.created_at, d.created_by
        FROM ifc_documents d
        LEFT JOIN ifc_specialties s ON s.ifc_specialty_id = d.specialty_id
        WHERE d.project_id = $1
        ORDER BY d.created_at DESC`,
        [projectId]
    );

    if (documents.rowCount === 0) return [];

    const versions = await pool.query<IfcDocumentVersionRow & { ifc_document_id: number }>(
        `SELECT i.ifc_document_id, i.ifc_file_id, i.version_number, i.is_current,
            i.status, i.error_message, i.processed_at, i.classification_config_used,
            f.uploaded_at, f.name, f.file_size,
            f.uploaded_by, u.name AS uploader_name, u.last_name AS uploader_last_name
        FROM ifc_files i
        INNER JOIN files f ON f.file_id = i.ifc_file_id
        INNER JOIN users u ON u.user_id = f.uploaded_by
        WHERE i.ifc_document_id = ANY($1::BIGINT[])
        ORDER BY i.version_number DESC`,
        [documents.rows.map((d) => d.ifc_document_id)]
    );

    const versionsByDocument = new Map<number, IfcDocumentVersionRow[]>();
    for (const { ifc_document_id, ...version } of versions.rows) {
        const list = versionsByDocument.get(ifc_document_id) ?? [];
        list.push(version);
        versionsByDocument.set(ifc_document_id, list);
    }

    return documents.rows.map((doc) => ({
        ...doc,
        versions: versionsByDocument.get(doc.ifc_document_id) ?? [],
    }));
};
