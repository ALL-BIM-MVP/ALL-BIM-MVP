// src/services/ifcfiles.service.ts
//


import { api } from './api';

export type IfcStatus = 'processing' | 'done' | 'error' | null;



export interface ClassificationSnapshot {
  mode: 'norma' | 'manual';
  property_prefix: string | null;
  code_property_set: string | null;
  code_property_name: string | null;
  description_property_set: string | null;
  description_property_name: string | null;
  unit_property_set: string | null;
  unit_property_name: string | null;
}

export interface ClassificationConfigField {
  slot: number;
  code_property_set: string | null;
  code_property_name: string;
  description_property_set: string | null;
  description_property_name: string | null;
  unit_property_set: string | null;
  unit_property_name: string | null;
}

export interface ClassificationConfig {
  project_id: number;
  mode: 'norma' | 'manual';
  mode_locked: boolean;
  property_prefix: string | null;
  property_prefix_locked: boolean;
  updated_at: string;
  updated_by: number | null;
  fields: ClassificationConfigField[];
}

export interface ClassificationConfigInput {
  mode: 'norma' | 'manual';
  mode_locked?: boolean;
  property_prefix?: string;
  property_prefix_locked?: boolean;
  code_property_set?: string;
  code_property_name?: string;
  description_property_set?: string;
  description_property_name?: string;
  unit_property_set?: string;
  unit_property_name?: string;
}

export interface ClassificationOverrideInput {
  mode?: 'manual';
  code_property_set?: string;
  code_property_name?: string;
  description_property_set?: string;
  description_property_name?: string;
  unit_property_set?: string;
  unit_property_name?: string;
  property_prefix?: string;
}

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
  ifc_document_id?: string;
  version_number?: number;
  is_current?: boolean;

  // Fase 1 de la migración a ThatOpen (ver docs/roadmap/migracion-visor-thatopen.md):
  // el backend genera este archivo .frag solo, sin que nadie lo pida.
  // null puede significar "es de antes de este cambio" O "la generación
  // todavía no terminó" — la API no distingue los dos casos a propósito
  // (ver resumen-nuevas-funcionalidades-frontend.txt). Se descarga con
  // el mismo getFileContentArrayBuffer de siempre, pasándole este id.
  fragments_file_id?: string | null;

  classification_config_used: ClassificationSnapshot;
}


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


export type IfcDocumentContext =
  | { specialtyId: number; documentName?: string }
  | { replacesIfcDocumentId: string };


  
export const uploadAndProcessIfcFile = async (
  projectId: number,
  file: File,
  documentContext: IfcDocumentContext,
  classificationOverride?: ClassificationOverrideInput
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
  if (classificationOverride) {
    formData.append('classification_override', JSON.stringify(classificationOverride));
  }
  const response = await api.postFormData(
    `/api/projects/${projectId}/ifc-metrados/process`,
    formData
  );
  return response;
};


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


export const getIfcProcessStatus = async (ifcFileId: string): Promise<IfcProcessStatus> => {
  const response = await api.get(`/api/ifc-files/${ifcFileId}`);
  return response;
};


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

  classification_config_used: ClassificationSnapshot;
}

export interface IfcDocument {
  ifc_document_id: string;
  project_id: number;
  name: string;

  specialty_id: number | null;
  specialty_code: string | null;
  specialty_name: string | null;
  created_at: string;
  created_by: number;

  versions: IfcDocumentVersion[];
}


export const listIfcDocuments = async (projectId: number): Promise<IfcDocument[]> => {
  const response = await api.get(`/api/projects/${projectId}/ifc-documents`);
  return response || [];
};


export const getClassificationConfig = async (
  projectId: number
): Promise<ClassificationConfig> => {
  const response = await api.get(
    `/api/projects/${projectId}/ifc-classification-config`
  );
  return response;
};


export const setClassificationConfig = async (
  projectId: number,
  config: ClassificationConfigInput
): Promise<ClassificationConfig> => {
  const response = await api.put(
    `/api/projects/${projectId}/ifc-classification-config`,
    config
  );
  return response;
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

// "origen_metrado" — de dónde salió el valor que la unidad de la
// partida realmente usa: dimensión IFC/calculada, propiedad de texto
// tal cual, o casos puntuales de armadura (diámetro/sección de acero).
// null cuando no aplica (ej. la unidad es "und", no hay de dónde sacar
// un "origen"). Sirve para mostrar de dónde salió un número "raro" sin
// tener que ir a revisar el IFC a mano.
export type OrigenMetrado = 'tipado' | 'geometrico' | 'texto' | 'acero_diametro' | 'acero_seccion' | null;

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
  origen_metrado?: OrigenMetrado;
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
  origen_metrado?: OrigenMetrado;
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

// Búsqueda inversa: dado un elemento (por su express_id), a qué
// partida pertenece (si pertenece a alguna) — usado por el botón "Ver
// partida" del popup de selección en el visor 3D. partida y metrado
// vienen null los DOS a la vez tanto si el elemento no existe en este
// archivo como si existe pero no está clasificado en ninguna partida —
// el backend no distingue esos dos casos con esta forma de respuesta,
// así que el frontend tampoco puede.
export interface ElementMetradoResult {
  express_id: number;
  tag: string | null;
  partida: { partida_id: number; code: string; description: string; unit: string | null } | null;
  metrado: {
    length: number | null;
    run_length: number | null;
    width: number | null;
    height: number | null;
    diameter: number | null;
    quantity: number | null;
    area: number | null;
    volume: number | null;
    weight: number | null;
    origen_metrado: string | null;
  } | null;
}

export const getElementMetrado = async (
  ifcFileId: string,
  expressId: number
): Promise<ElementMetradoResult> => {
  const response = await api.get(`/api/ifc-files/${ifcFileId}/elements/${expressId}/metrado`);
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

export const exportToExcel = async (ifcFileId: string): Promise<IfcFile> => {
  return await api.post(`/api/ifc-files/${ifcFileId}/export-excel`, {});
};

// ============================================================
// "Probar" config de clasificación manual (dry-run) — Consolidación
// punto 5. Corre solo el mapeo de propiedades contra el archivo IFC que
// el usuario tiene elegido para subir EN ESE MOMENTO (todavía no existe
// en el servidor, así que va como multipart — ver uploadDryRunFile en
// el backend, que lo escribe en un temporal y lo borra después, nunca
// lo guarda como archivo del proyecto ni crea ninguna fila). Sin
// guardar nada ni correr el pipeline completo: mucho más rápido que
// reprocesar (~38s vs. ~2min en un IFC de 109MB, según el backend).
export interface ClassificationDryRunConfig {
  property_prefix?: string;
  code_property_set?: string;
  code_property_name: string;
  description_property_set?: string;
  description_property_name?: string;
  unit_property_set?: string;
  unit_property_name?: string;
}

export interface ClassificationDryRunResult {
  elementos_totales: number;
  elementos_con_codigo: number;
  elementos_sin_codigo: number;
  ejemplos: Array<{
    codigo: string;
    descripcion: string | null;
    unidad: string | null;
    cantidad: number;
  }>;
  propiedades_con_prefijo: number | null;
}

export const classificationDryRun = async (
  projectId: number,
  file: File,
  config: ClassificationDryRunConfig
): Promise<ClassificationDryRunResult> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('classification_config', JSON.stringify(config));
  const response = await api.postFormData(
    `/api/projects/${projectId}/ifc-metrados/classification-dry-run`,
    formData
  );
  return response;
};

// ============================================================
// "Estado de elementos" — Consolidación punto 1.a. Detecta, a nivel
// de PROYECTO, "elemento conjunto" repetidos o incompletos (ver
// metrados-estado.models.ts en el backend para la definición
// completa). Shape espejado 1:1 del backend — OJO, "resultados" viene
// YA deduplicado (una fila por "elemento conjunto" DISTINTO con algún
// problema, no una fila por elemento crudo): "repetidos" dice cuántas
// veces apareció ese grupo (null si apareció 1 sola vez), y
// "faltantes" viene AUSENTE (no array vacío) cuando no falta ningún
// campo — nunca asumir que siempre está presente.
export interface ElementoConjuntoProblema {
  elemento_conjunto: string;
  repetidos: number | null;
  faltantes?: string[];
}

export interface EstadoElementosResult {
  project_id: number;
  campos_clave: string[];
  total_elementos_evaluados: number;
  elementos_conjunto_unicos: number;
  con_problemas: number;
  resultados: ElementoConjuntoProblema[];
}

// Requiere permiso 'view' del módulo Metrados en este proyecto — si el
// usuario no lo tiene (o el proyecto no tiene el módulo activo), el
// backend devuelve 403 y el llamador debe tratarlo como "no hay datos
// para mostrar", no como un error visible (ver uso en
// DashboardProjects.tsx).
export const getEstadoElementos = async (projectId: number): Promise<EstadoElementosResult> => {
  const response = await api.get(`/api/projects/${projectId}/metrados/estado-elementos`);
  return response;
};

// ============================================================
// Configuración de "elemento conjunto" — Consolidación punto 1.a.
// Qué campos componen la clave que usa GET .../estado-elementos de
// arriba. Antes eran 4 campos fijos (archivo+guid+tag+código); ahora
// es configurable por proyecto, mínimo 2 campos, builtin y/o
// propiedades del IFC. Requiere permiso 'configure' del módulo
// Metrados para el PUT, 'view' para los dos GET — ver
// elemento-conjunto.service.ts en el backend.
export type ElementoConjuntoBuiltinField = 'file_name' | 'global_id' | 'tag' | 'partida_code';

export interface ElementoConjuntoFieldRow {
  position: number;
  field_type: 'builtin' | 'property';
  builtin_field: ElementoConjuntoBuiltinField | null;
  property_set: string | null;
  property_name: string | null;
}

export interface ElementoConjuntoConfigFull {
  project_id: number;
  updated_at: string;
  updated_by: number | null;
  fields: ElementoConjuntoFieldRow[];
}

export interface AvailableElementoConjuntoFields {
  builtin: { builtin_field: ElementoConjuntoBuiltinField; label: string }[];
  ifc_properties: { property_set: string; property_name: string }[];
}

// Input para el PUT — mismo shape que ElementoConjuntoFieldRow pero
// sin "position" (el orden lo da la posición dentro del array) y sin
// los campos que no aplican a cada variante (el backend usa un
// discriminated union por field_type, ver elemento-conjunto.schema.ts).
export type ElementoConjuntoFieldInput =
  | { field_type: 'builtin'; builtin_field: ElementoConjuntoBuiltinField }
  | { field_type: 'property'; property_set?: string; property_name: string };

export const getAvailableElementoConjuntoFields = async (
  projectId: number
): Promise<AvailableElementoConjuntoFields> => {
  const response = await api.get(`/api/projects/${projectId}/elemento-conjunto-config/available-fields`);
  return response;
};

export const getElementoConjuntoConfig = async (projectId: number): Promise<ElementoConjuntoConfigFull> => {
  const response = await api.get(`/api/projects/${projectId}/elemento-conjunto-config`);
  return response;
};

// Reemplaza TODA la lista de campos (no es un PATCH parcial) — mínimo
// 2, sin repetidos, mismo criterio que setClassificationConfig.
export const setElementoConjuntoConfig = async (
  projectId: number,
  fields: ElementoConjuntoFieldInput[]
): Promise<ElementoConjuntoConfigFull> => {
  const response = await api.put(`/api/projects/${projectId}/elemento-conjunto-config`, { fields });
  return response;
};