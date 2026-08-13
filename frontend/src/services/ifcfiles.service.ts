// src/services/ifc-files.service.ts
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
}

export interface IfcProcessStatus {
  ifc_file_id?: number;
  status: 'processing' | 'done' | 'error';
  schema_version: string | null;
  processed_at: string | null;
  error_message: string | null;
}

/**
 * Lista los archivos IFC de un proyecto.
 * processed=true  -> solo terminados (ifc_status === 'done')
 * processed=false -> nunca procesados o con error
 * processed=undefined -> todos los ifc del proyecto, sin filtrar por estado
 */
export const listProjectIfcFiles = async (
  projectId: number,
  processed?: boolean
): Promise<IfcFile[]> => {
  const params = new URLSearchParams({ file_type: 'ifc' });
  if (processed !== undefined) {
    params.set('processed', String(processed));
  }
  const response = await api.get(`/api/projects/${projectId}/files?${params.toString()}`);
  return response || [];
};

/**
 * Trae los bytes crudos de un archivo ya subido (para graficarlo en el
 * visor sin forzar descarga — sin ?download=true, se sirve inline).
 */
export const getFileContentArrayBuffer = async (fileId: string): Promise<ArrayBuffer> => {
  // NOTA: api.get normalmente parsea JSON — para bytes crudos usamos
  // fetch directo, pero contra la misma BASE_URL y con la misma key de
  // localStorage que usa api.ts ('accessToken', ver ese archivo).
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
 */
export const processExistingIfcFile = async (
  projectId: number,
  fileId: string,
  force = false
): Promise<IfcProcessStatus> => {
  const qs = force ? '?force=true' : '';
  const response = await api.post(
    `/api/projects/${projectId}/ifc-metrados/process${qs}`,
    { file_id: Number(fileId) } // el body pide number acá, según el doc: { "file_id": 1 }
  );
  return response;
};

/**
 * Sube + procesa en un solo paso (variante a del doc) — multipart.
 * OJO: usa api.postFormData, NO api.post — api.post siempre hace
 * JSON.stringify(data) sobre lo que le pasás, y JSON.stringify(FormData)
 * da "{}" (body vacío), lo que dispara 400 IFC_FILE_REQUIRED en el
 * backend por más que el archivo sí se haya adjuntado acá.
 */
export const uploadAndProcessIfcFile = async (
  projectId: number,
  file: File
): Promise<IfcProcessStatus> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.postFormData(
    `/api/projects/${projectId}/ifc-metrados/process`,
    formData
  );
  return response;
};

/**
 * Solo sube el archivo, sin procesarlo (POST /projects/:p/files, 1.1 del doc).
 * Útil si en algún flujo se quiere "guardar sin procesar todavía".
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
// PARTIDAS — doc sección 3
// ============================================================

export interface PartidaNode {
  partida_id: number;
  parent_id: number | null;
  code: string;
  description: string;
  unit: string | null; // null = carpeta/categoría, no null = partida real (hoja)
  sort_order: number;
  element_count: number;
  total: number | null;
  children: PartidaNode[];
}

/**
 * Árbol liviano de partidas — GET /ifc-files/:id/partidas (doc 3.1).
 * Requiere que el ifc_file ya esté en status "done".
 */
export const getPartidasTree = async (ifcFileId: string): Promise<PartidaNode[]> => {
  const response = await api.get(`/api/ifc-files/${ifcFileId}/partidas`);
  return response || [];
};

export interface PartidaElementDetail {
  element_id: number;
  express_id: number;
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

/**
 * Detalle agrupado de una partida hoja (unit !== null) —
 * POST /ifc-files/:id/partidas/:partidaId/elements (doc 3.2).
 * Sin body (o {}) usa el group_by por defecto (level_name, space_name, tag)
 * y no resuelve columnas de propiedad IFC (100% backward-compatible).
 */
export const getPartidaElements = async (
  ifcFileId: string,
  partidaId: number,
  options?: { group_by?: Array<'level_name' | 'space_name' | 'tag'> }
): Promise<PartidaDetail> => {
  const response = await api.post(
    `/api/ifc-files/${ifcFileId}/partidas/${partidaId}/elements`,
    options || {}
  );
  return response;
};

// El campo del grupo/elemento que corresponde al "metrado real" según
// la unidad de la partida — ver doc 3.2 ("sub_total SÍ multiplica").
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