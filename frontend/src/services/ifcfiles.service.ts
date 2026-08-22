// src/services/ifcfiles.service.ts
//
// Servicio para el flujo de carga/listado/procesamiento de archivos IFC.
// Basado 1:1 en la documentación de endpoints (sección 1 y 2):
//   GET  /api/projects/:projectId/files?file_type=ifc&processed=true|false
//   GET  /api/files/:fileId/content
//   POST /api/projects/:projectId/ifc-metrados/process   { file_id }  (o multipart)
//   GET  /api/ifc-files/:ifcFileId                        (poll de estado)
//
// OJO (ver doc): file_id / ifc_file_id vienen como STRING desde el
// backend (BIGINT de Postgres) — se tratan como opacos, nunca se
// castean a number ni se usan en aritmética.
//
// Fase 3 (especialidad + versionado de IFC, 2026-08-21): cada IFC ahora
// pertenece a un "documento" (identidad estable) con una especialidad.
// Subir una corrección del mismo documento se hace como VERSIÓN nueva
// de ese documento, no como archivo suelto. Ver
// docs/roadmap-modulos-y-permisos.md, sección "Fase 3", para el porqué
// del diseño (tombstone de versiones viejas, etc.).

import { api } from './api';

export type IfcStatus = 'processing' | 'done' | 'error' | null;

export interface IfcFile {
  file_id: string;
  project_id: number;
  file_type: string;
  name: string;
  file_size: string;
  checksum: string;
  mime_type: string;
  uploaded_at: string;
  ifc_status: IfcStatus;
  ifc_error_message: string | null;
  uploaded_by: {
    user_id: number;
    user_name: string;
    user_email: string;
  };
  // Fase 3 — null para archivos que no son ifc, o un ifc que nunca se
  // mandó a procesar.
  ifc_document_id: string | null;
  ifc_document_name: string | null;
  version_number: number | null;
  is_current: boolean | null;
  specialty_code: string | null;
  specialty_name: string | null;
}

export interface IfcProcessStatus {
  ifc_file_id?: number;
  status: 'processing' | 'done' | 'error';
  schema_version: string | null;
  processed_at: string | null;
  error_message: string | null;
  // Fase 3 — is_current arranca SIEMPRE en false mientras procesa
  // (incluso para la v1 de un documento recién creado), recién pasa a
  // true cuando termina bien. Si el procesamiento falla, queda en false
  // para siempre (esa versión nunca llegó a ser la vigente).
  ifc_document_id?: string;
  version_number?: number;
  is_current?: boolean;
}

/**
 * Lista los archivos IFC de un proyecto.
 * processed=true  -> solo terminados (ifc_status === 'done')
 * processed=false -> nunca procesados o con error
 * processed=undefined -> todos los ifc del proyecto, sin filtrar por estado
 * onlyCurrent=true -> Fase 3: solo la versión vigente de cada documento
 *   (sin el param, se sigue viendo TODO el historial — comportamiento
 *   de siempre, no rompe nada existente).
 */
export const listProjectIfcFiles = async (
  projectId: number,
  processed?: boolean,
  onlyCurrent?: boolean
): Promise<IfcFile[]> => {
  const params = new URLSearchParams({ file_type: 'ifc' });
  if (processed !== undefined) {
    params.set('processed', String(processed));
  }
  if (onlyCurrent) {
    params.set('only_current', 'true');
  }
  const response = await api.get(`/api/projects/${projectId}/files?${params.toString()}`);
  return response || [];
};

/**
 * Trae los bytes crudos de un archivo ya subido (para graficarlo en el
 * visor sin forzar descarga — sin ?download=true, se sirve inline).
 */
export const getFileContentArrayBuffer = async (fileId: string): Promise<ArrayBuffer> => {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(`http://localhost:4000/api/files/${fileId}/content`, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
  });
  if (!res.ok) {
    throw new Error(`No se pudo obtener el contenido del archivo (HTTP ${res.status})`);
  }
  return res.arrayBuffer();
};

/**
 * Dispara el procesamiento de un archivo YA subido (variante b del doc).
 * Fase 3: si este file_id ya fue procesado antes, su documento/versión
 * ya están fijados y el backend ignora cualquier documentContext — solo
 * importa la primera vez que ese archivo se procesa. Por eso esta
 * función NO pide documentContext (a diferencia de uploadAndProcessIfcFile).
 */
export const processExistingIfcFile = async (
  projectId: number,
  fileId: string,
  force = false
): Promise<IfcProcessStatus> => {
  const qs = force ? '?force=true' : '';
  const response = await api.post(
    `/api/projects/${projectId}/ifc-metrados/process${qs}`,
    { file_id: Number(fileId) }
  );
  return response;
};

// Fase 3: quién es este archivo — o es un documento NUEVO (con
// especialidad), o es una VERSIÓN NUEVA de un documento existente
// (mutuamente excluyente, igual que valida el backend con un 400 si
// mandás los dos). El tipo unión hace que TypeScript obligue a elegir
// uno de los dos en tiempo de compilación, en vez de descubrirlo con un
// 400 en producción.
export type IfcDocumentContext =
  | { specialtyId: number; documentName?: string }
  | { replacesIfcDocumentId: string };

/**
 * Sube + procesa en un solo paso (variante a del doc) — multipart.
 * OJO: usa api.postFormData, NO api.post — api.post siempre hace
 * JSON.stringify(data) sobre lo que le pasás, y JSON.stringify(FormData)
 * da "{}" (body vacío), lo que dispara 400 IFC_FILE_REQUIRED en el
 * backend por más que el archivo sí se haya adjuntado acá.
 *
 * Fase 3: documentContext es obligatorio — sin uno de los dos casos
 * (specialtyId o replacesIfcDocumentId), el backend responde 400
 * IFC_SPECIALTY_REQUIRED. Ver el modal "¿Qué es este archivo?" en
 * Visor3DTab.tsx, que es quien arma este objeto según lo que elige el
 * usuario.
 */
export const uploadAndProcessIfcFile = async (
  projectId: number,
  file: File,
  documentContext: IfcDocumentContext
): Promise<IfcProcessStatus> => {
  const formData = new FormData();
  formData.append('file', file);
  if ('specialtyId' in documentContext) {
    formData.append('specialty_id', String(documentContext.specialtyId));
    if (documentContext.documentName) {
      formData.append('document_name', documentContext.documentName);
    }
  } else {
    formData.append('replaces_ifc_document_id', documentContext.replacesIfcDocumentId);
  }
  const response = await api.postFormData(
    `/api/projects/${projectId}/ifc-metrados/process`,
    formData
  );
  return response;
};

/**
 * Solo sube el archivo, sin procesarlo (POST /projects/:p/files, 1.1 del doc).
 * No pide documentContext — esta ruta no pasa por ifc-metrados/process,
 * así que la regla de especialidad/versión no aplica acá (se define
 * recién cuando el archivo se manda a procesar).
 */
export const uploadIfcFileOnly = async (
  projectId: number,
  file: File
): Promise<IfcFile> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('file_type', 'ifc');
  const response = await api.postFormData(`/api/projects/${projectId}/files`, formData);
  return response;
};

/**
 * Consulta el estado de procesamiento (para hacer polling cada 2-3s
 * mientras status === 'processing').
 */
export const getIfcProcessStatus = async (ifcFileId: string): Promise<IfcProcessStatus> => {
  const response = await api.get(`/api/ifc-files/${ifcFileId}`);
  return response;
};

/**
 * Helper de polling: consulta el estado cada `intervalMs` hasta que
 * termine (done o error), o hasta agotar `maxAttempts`.
 */
export const pollIfcProcessStatus = async (
  ifcFileId: string,
  { intervalMs = 2500, maxAttempts = 120 }: { intervalMs?: number; maxAttempts?: number } = {}
): Promise<IfcProcessStatus> => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getIfcProcessStatus(ifcFileId);
    if (status.status === 'done' || status.status === 'error') {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error('Tiempo de espera agotado procesando el archivo IFC.');
};

// ============================================================
// ESPECIALIDADES Y DOCUMENTOS IFC — Fase 3
// ============================================================

export interface IfcSpecialty {
  ifc_specialty_id: number;
  code: string;
  name: string;
  is_active: boolean;
}

/**
 * Catálogo de especialidades (Arquitectura/Estructuras/Sanitarias, etc.)
 * — abierto a crecer sin que el frontend tenga que cambiar nada. Se usa
 * para poblar el <select> del modal "documento nuevo".
 */
export const listIfcSpecialties = async (): Promise<IfcSpecialty[]> => {
  const response = await api.get('/api/ifc-specialties');
  return response || [];
};

export interface IfcDocumentVersion {
  ifc_file_id: string;
  version_number: number;
  is_current: boolean;
  status: 'processing' | 'done' | 'error';
  error_message: string | null;
  processed_at: string | null;
  uploaded_at: string;
  name: string;
  file_size: string;
  uploaded_by: number;
  uploader_name: string;
  uploader_last_name: string | null;
}

export interface IfcDocument {
  ifc_document_id: string;
  project_id: number;
  name: string;
  // null para documentos creados ANTES de esta fase (backfill) — son
  // documentos válidos para versionar igual, mostralos como "Sin
  // especialidad" en vez de ocultarlos.
  specialty_id: number | null;
  specialty_code: string | null;
  specialty_name: string | null;
  created_at: string;
  created_by: number;
  // Más nueva primero. La de is_current === true es la vigente — la que
  // se muestra como "v{N} vigente" en el buscador del modal de subida.
  versions: IfcDocumentVersion[];
}

/**
 * Documentos IFC de un proyecto, cada uno con TODAS sus versiones — lo
 * que necesita el buscador "¿es una versión nueva de cuál documento?"
 * del modal de subida.
 */
export const listIfcDocuments = async (projectId: number): Promise<IfcDocument[]> => {
  const response = await api.get(`/api/projects/${projectId}/ifc-documents`);
  return response || [];
};

// ============================================================
// PARTIDAS — doc sección 3
// ============================================================

export interface PartidaNode {
  partida_id: number;
  parent_id: number | null;
  code: string;
  description: string;
  unit: string | null;
  sort_order: number;
  element_count: number;
  total: number | null;
  children: PartidaNode[];
}

export const getPartidasTree = async (ifcFileId: string): Promise<PartidaNode[]> => {
  const response = await api.get(`/api/ifc-files/${ifcFileId}/partidas`);
  return response || [];
};

export interface PartidaElementDetail {
  element_id: string;
  express_id: string;
  name: string;
  length: number;
  run_length: number;
  width: number;
  height: number;
  quantity: number;
  area: number;
  volume: number;
  weight: number;
  properties: Record<string, string | null>;
}

export interface PartidaGroup {
  level_name: string;
  space_name: string;
  tag: string;
  element_count: number;
  length: number;
  run_length: number;
  width: number;
  height: number;
  quantity: number;
  area: number;
  volume: number;
  weight: number;
  sub_total: number;
  properties: Record<string, string | null>;
  elements: PartidaElementDetail[];
}

export interface PartidaDetail {
  partida_id: number;
  unit: string;
  total: number;
  resolved_properties: Array<{
    key: string;
    name: string;
    property_set_name: string;
    property_name: string;
    found: boolean;
  }>;
  groups: PartidaGroup[];
}

export interface PartidaColumnRequest {
  name: string;
  source_type: 'ifc_property';
  property_set_name: string;
  property_name: string;
  column_order: number;
}

export interface GetPartidaElementsOptions {
  group_by?: Array<'level_name' | 'space_name' | 'tag'>;
  template_id?: number;
  columns?: PartidaColumnRequest[];
}

export const getPartidaElements = async (
  ifcFileId: string,
  partidaId: number,
  options?: GetPartidaElementsOptions
): Promise<PartidaDetail> => {
  const response = await api.post(
    `/api/ifc-files/${ifcFileId}/partidas/${partidaId}/elements`,
    options || {}
  );
  return response;
};

export function metradoFieldForUnit(unit: string): keyof Pick<
  PartidaGroup,
  'run_length' | 'area' | 'volume' | 'weight' | 'quantity'
> {
  if (unit === 'm') return 'run_length';
  if (unit === 'm2') return 'area';
  if (unit === 'm3') return 'volume';
  if (unit === 'kg') return 'weight';
  return 'quantity';
}