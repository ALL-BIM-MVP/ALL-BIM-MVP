// src/services/templates.service.ts
//
// Servicio para el sistema de plantillas de columnas (sección 4 del doc):
//   GET    /api/templates?scope=system|mine|all
//   GET    /api/templates/:templateId
//   POST   /api/templates
//   PUT    /api/templates/:templateId/columns
//   PATCH  /api/templates/:templateId/columns/:columnId
//   DELETE /api/templates/:templateId
//   GET    /api/ifc-files/:ifcFileId/available-columns   (cuelga de
//          /ifc-files, NO de /templates — mismo router que partidas)
//
// Las plantillas son globales (no por proyecto): del sistema
// (is_system=true, solo lectura) o personales (created_by=vos,
// editables solo por vos). Ver doc 4) para el detalle completo.
//
// NOTA sobre api.ts: este archivo asume que además de .get/.post/
// .postFormData ya usados en ifcfiles.service.ts, api.ts expone
// .put/.patch/.delete con el mismo wrapper (Authorization + JSON).
// Si no existen todavía, agregarlos ahí siguiendo el mismo patrón.

import { api } from './api';
import type { PartidaColumnRequest } from './ifcfiles.service';

// ============================================================
// Tipos
// ============================================================

export type BuiltinField =
  // Identificación
  | 'code' | 'description' | 'unit' | 'level_name' | 'space_name' | 'tag'
  // Dimensiones
  | 'length' | 'width' | 'height'
  // Metrado — OJO: run_length (Longitud), no confundir con length (Largo)
  | 'run_length' | 'quantity' | 'area' | 'volume' | 'weight'
  // Totales
  | 'sub_total' | 'total';

export type SourceType = 'builtin' | 'ifc_property';

export interface TemplateColumn {
  template_column_id?: number; // ausente al crear, presente al leer
  name: string;
  source_type: SourceType;
  builtin_field: BuiltinField | null;
  property_set_name: string | null;
  property_name: string | null;
  column_order: number;
  is_visible: boolean;
}

export interface TemplateSet {
  template_set_id?: number;
  name: string;
  sort_order: number;
  columns: TemplateColumn[];
}

export interface TemplateSummary {
  template_id: number;
  name: string;
  description: string | null;
  is_system: boolean;
  is_default: boolean;
  created_by: number | null;
  created_at: string;
}

export interface TemplateFull extends TemplateSummary {
  sets: TemplateSet[];
}

export type TemplateScope = 'system' | 'mine' | 'all';

export interface BuiltinCatalogEntry {
  builtin_field: BuiltinField;
  label_default: string;
  data_type: string;
  is_aggregate: boolean;
  applies_to_group: string;
  sort_order: number;
}

export interface IfcPropertyCatalogEntry {
  property_set: string; // puede venir "" (propiedad suelta sin Pset)
  property_name: string;
  data_type: string | null; // siempre null por ahora, el pipeline no lo extrae
}

export interface AvailableColumns {
  builtin: BuiltinCatalogEntry[];
  ifc_properties: IfcPropertyCatalogEntry[];
}

// ---- payloads de escritura ----

export interface TemplateColumnInput {
  name: string;
  source_type: SourceType;
  builtin_field?: BuiltinField;       // solo si source_type === 'builtin'
  property_set_name?: string;         // solo si source_type === 'ifc_property'
  property_name?: string;             // solo si source_type === 'ifc_property'
  column_order: number;
  is_visible?: boolean; // default true
}

export interface TemplateSetInput {
  name: string;
  sort_order: number;
  columns: TemplateColumnInput[];
}

export interface CreateTemplateInput {
  name: string;
  description?: string | null;
  sets: TemplateSetInput[];
}

// La forma que pide PUT /templates/:id/columns es la misma que "sets"
// en el POST — el doc lo aclara explícito en 4.4.
export type ReplaceTemplateColumnsInput = TemplateSetInput[];

// Key con la que aparecen las columnas ifc_property en
// group.properties / element.properties (sección 3.2 del doc).
export function propertyKey(setName: string | null, propName: string | null): string {
  return `${setName ?? ''}::${propName ?? ''}`;
}

// ============================================================
// Plantilla de respaldo (100% local, no viene del backend)
// ============================================================
//
// Si /api/templates?scope=all devuelve [] (la BD todavía no tiene
// sembrada la plantilla del sistema "Detallado (default)" que
// describe la doc), esto evita que el frontend se quede sin nada que
// mostrar. Mismas columnas que el <table> hardcodeado original, así
// el resultado visual es idéntico mientras no exista el seed real.
//
// template_id: -1 nunca puede matchear un template_id real de Postgres
// (son BIGINT autoincrement, siempre > 0) — así isOwn siempre da false
// para esta plantilla, y "Guardar" en el editor va SIEMPRE por
// createTemplate (POST), nunca intenta un PUT sobre un id que no
// existe en la BD.
let fallbackColOrder = 0;
const fb = (
  name: string,
  builtin_field: BuiltinField
): TemplateColumn => ({
  template_column_id: undefined,
  name,
  source_type: 'builtin',
  builtin_field,
  property_set_name: null,
  property_name: null,
  column_order: ++fallbackColOrder,
  is_visible: true,
});
// OJO: fallbackColOrder es un contador GLOBAL (no se resetea por set),
// a propósito NO representativo de cómo numera el backend real
// (ahí column_order es 1..n POR SET). Acá funciona igual porque
// flattenVisibleColumns ordena primero por set y recién adentro de
// cada set por column_order — como los valores de este contador son
// estrictamente ascendentes, la sub-secuencia dentro de cada set
// también queda ascendente sin querer. No copiar este patrón al
// generar columnas reales (ver TemplateEditor.buildPayload, que sí
// numera 1..n por cada set como corresponde).

export const FALLBACK_DEFAULT_TEMPLATE: TemplateFull = {
  template_id: -1,
  name: 'Detallado (default)',
  description: 'Plantilla de respaldo local — todavía no hay ninguna sembrada en la base de datos.',
  is_system: true,
  is_default: true,
  created_by: null,
  created_at: new Date(0).toISOString(),
  sets: [
    {
      name: 'IDENTIFICACIÓN',
      sort_order: 1,
      columns: [fb('ITEM', 'code'), fb('DESCRIPCIÓN', 'description'), fb('UND', 'unit')],
    },
    {
      name: 'DIMENSIONES',
      sort_order: 2,
      columns: [fb('Largo', 'length'), fb('Ancho', 'width'), fb('Altura', 'height')],
    },
    {
      name: 'METRADO',
      sort_order: 3,
      columns: [
        fb('Longitud', 'run_length'),
        fb('Cant.', 'quantity'),
        fb('Área', 'area'),
        fb('Vol.', 'volume'),
        fb('Kg.', 'weight'),
        fb('Sub Total', 'sub_total'),
        fb('TOTAL', 'total'),
      ],
    },
  ],
};

// Versión resumida (sin sets/columnas) para meter en la lista del
// selector — misma forma que devuelve GET /templates.
export const FALLBACK_DEFAULT_TEMPLATE_SUMMARY: TemplateSummary = {
  template_id: FALLBACK_DEFAULT_TEMPLATE.template_id,
  name: FALLBACK_DEFAULT_TEMPLATE.name,
  description: FALLBACK_DEFAULT_TEMPLATE.description,
  is_system: FALLBACK_DEFAULT_TEMPLATE.is_system,
  is_default: FALLBACK_DEFAULT_TEMPLATE.is_default,
  created_by: FALLBACK_DEFAULT_TEMPLATE.created_by,
  created_at: FALLBACK_DEFAULT_TEMPLATE.created_at,
};

// Catálogo fijo de respaldo (100% local) — mismo patrón que
// FALLBACK_DEFAULT_TEMPLATE: si GET /ifc-files/:id/available-columns
// devuelve "builtin": [] (la BD no tiene sembrado el
// builtin_field_catalog, visto en un entorno real), esto evita que la
// pestaña "Campos fijos" del editor quede vacía y sin explicación. Los
// 16 campos son fijos por diseño (no dependen del IFC), así que
// listarlos acá es seguro y no debería quedar desactualizado salvo que
// cambie el catálogo real (ver doc 4.3, "builtin_field válidos").
export const FALLBACK_BUILTIN_CATALOG: BuiltinCatalogEntry[] = [
  { builtin_field: 'code', label_default: 'ITEM', data_type: 'text', is_aggregate: false, applies_to_group: 'identificacion', sort_order: 1 },
  { builtin_field: 'description', label_default: 'DESCRIPCIÓN', data_type: 'text', is_aggregate: false, applies_to_group: 'identificacion', sort_order: 2 },
  { builtin_field: 'unit', label_default: 'UND', data_type: 'text', is_aggregate: false, applies_to_group: 'identificacion', sort_order: 3 },
  { builtin_field: 'level_name', label_default: 'NIVEL', data_type: 'text', is_aggregate: false, applies_to_group: 'identificacion', sort_order: 4 },
  { builtin_field: 'space_name', label_default: 'ESPACIO', data_type: 'text', is_aggregate: false, applies_to_group: 'identificacion', sort_order: 5 },
  { builtin_field: 'tag', label_default: 'TAG', data_type: 'text', is_aggregate: false, applies_to_group: 'identificacion', sort_order: 6 },
  { builtin_field: 'length', label_default: 'Largo', data_type: 'number', is_aggregate: false, applies_to_group: 'dimensiones', sort_order: 7 },
  { builtin_field: 'width', label_default: 'Ancho', data_type: 'number', is_aggregate: false, applies_to_group: 'dimensiones', sort_order: 8 },
  { builtin_field: 'height', label_default: 'Altura', data_type: 'number', is_aggregate: false, applies_to_group: 'dimensiones', sort_order: 9 },
  { builtin_field: 'run_length', label_default: 'Longitud', data_type: 'number', is_aggregate: true, applies_to_group: 'metrado', sort_order: 10 },
  { builtin_field: 'quantity', label_default: 'Cant.', data_type: 'number', is_aggregate: true, applies_to_group: 'metrado', sort_order: 11 },
  { builtin_field: 'area', label_default: 'Área', data_type: 'number', is_aggregate: true, applies_to_group: 'metrado', sort_order: 12 },
  { builtin_field: 'volume', label_default: 'Vol.', data_type: 'number', is_aggregate: true, applies_to_group: 'metrado', sort_order: 13 },
  { builtin_field: 'weight', label_default: 'Kg.', data_type: 'number', is_aggregate: true, applies_to_group: 'metrado', sort_order: 14 },
  { builtin_field: 'sub_total', label_default: 'Sub Total', data_type: 'number', is_aggregate: true, applies_to_group: 'totales', sort_order: 15 },
  { builtin_field: 'total', label_default: 'TOTAL', data_type: 'number', is_aggregate: true, applies_to_group: 'totales', sort_order: 16 },
];

// ============================================================
// 4.1) Listar plantillas visibles
// ============================================================

/**
 * Lista plana de plantillas (sin sets/columnas), para un selector.
 * Orden que ya trae el backend: default primero, sistema, propias,
 * alfabético dentro de cada grupo — no reordenar de nuevo.
 */
export const listTemplates = async (scope?: TemplateScope): Promise<TemplateSummary[]> => {
  const qs = scope ? `?scope=${scope}` : '';
  const response = await api.get(`/api/templates${qs}`);
  return response || [];
};

/**
 * Atajo: la plantilla is_default=true del scope=system — la que se
 * carga la primera vez que el usuario entra a metrados de un proyecto.
 * No asumir que su template_id es fijo entre entornos (ver doc 4).
 */
export const getDefaultTemplate = async (): Promise<TemplateSummary | null> => {
  const templates = await listTemplates('system');
  return templates.find((t) => t.is_default) ?? null;
};

// ============================================================
// 4.2) Traer una plantilla completa (anidada)
// ============================================================

/**
 * Trae sets + columnas, YA ordenados (no reordenar). Incluye columnas
 * con is_visible=false a propósito — filtrar recién al pintar la tabla,
 * así se puede "restaurar" una columna oculta sin perder su config.
 */
export const getTemplate = async (templateId: number): Promise<TemplateFull> => {
  const response = await api.get(`/api/templates/${templateId}`);
  return response;
};

// ============================================================
// 4.3) Guardar una plantilla nueva
// ============================================================

/**
 * Siempre crea is_system=false, is_default=false, created_by=vos.
 * Nunca pisa la del sistema, aunque el nombre coincida con una — pero
 * ojo: TEMPLATE_CONFLICT sí salta si el nombre se repite entre las
 * TUYAS, o si sort_order/column_order viene repetido en el body.
 */
export const createTemplate = async (input: CreateTemplateInput): Promise<TemplateFull> => {
  const response = await api.post('/api/templates', input);
  return response;
};

// ============================================================
// 4.4) Editar una plantilla propia (reemplazo total)
// ============================================================

/**
 * OJO: esto REEMPLAZA toda la estructura (borra todos los sets/
 * columnas viejos e inserta de cero los del body) — nunca es un PATCH
 * parcial. El frontend siempre manda la estructura COMPLETA (la que
 * ya cargó con getTemplate, con los cambios del usuario aplicados
 * encima), nunca un delta.
 *
 * Solo funciona sobre una plantilla TUYA. Para "editar" la del
 * sistema: primero createTemplate() con esa misma estructura y editar
 * la copia resultante.
 *
 * La respuesta trae ids NUEVOS en sets/columnas (se recrearon, no se
 * reusan los viejos) — si el componente los usa como key de React,
 * reemplazar el estado entero con la respuesta, no mergear.
 */
export const replaceTemplateColumns = async (
  templateId: number,
  sets: ReplaceTemplateColumnsInput
): Promise<TemplateFull> => {
  // OJO: el body tiene que ser { sets: [...] } — un OBJETO con la
  // clave "sets", no el array pelado. El schema del backend
  // (UpdateTemplateColumnsBodySchema) espera z.object({ sets: [...] }),
  // no z.array(...) directo. Mandar el array suelto tira 400
  // INVALID_REQUEST_DATA sin explicar por qué (Zod rechaza la forma
  // general antes de mirar el contenido).
  const response = await api.put(`/api/templates/${templateId}/columns`, { sets });
  return response;
};

// ============================================================
// 4.5) Ocultar/mostrar una columna puntual
// ============================================================

/**
 * Toggle rápido del ícono de "ojo" de una sola columna, sin reenviar
 * la plantilla entera. También solo sobre una plantilla tuya.
 * Devuelve la columna sola, no la plantilla completa.
 */
export const setColumnVisibility = async (
  templateId: number,
  columnId: number,
  isVisible: boolean
): Promise<TemplateColumn> => {
  const response = await api.patch(`/api/templates/${templateId}/columns/${columnId}`, {
    is_visible: isVisible,
  });
  return response;
};

// ============================================================
// 4.6) Catálogo de columnas disponibles para un IFC puntual
// ============================================================

/**
 * ⚠️ Cuelga de /api/ifc-files, NO de /api/templates.
 * "builtin" es el catálogo fijo de 16 campos. "ifc_properties" depende
 * de qué propiedades trae REALMENTE el archivo (de Revit, cada IFC
 * puede traer property sets distintos). property_set puede venir ""
 * (propiedad suelta sin Pset, es un caso real, no bug).
 */
export const getAvailableColumns = async (ifcFileId: string): Promise<AvailableColumns> => {
  const response = await api.get(`/api/ifc-files/${ifcFileId}/available-columns`);
  return response;
};

// ============================================================
// 4.7) Borrar una plantilla propia
// ============================================================

/**
 * Solo una plantilla TUYA, nunca la del sistema ni la de otro usuario.
 * Borra también todos sus sets/columnas (ON DELETE CASCADE en el back).
 */
export const deleteTemplate = async (templateId: number): Promise<{ message: string }> => {
  const response = await api.delete(`/api/templates/${templateId}`);
  return response;
};

// ============================================================
// Puente plantilla -> request de partidas (doc 3.2)
// ============================================================

/**
 * Convierte las columnas visibles de una plantilla al array `columns`
 * que espera POST /ifc-files/:id/partidas/:partidaId/elements.
 *
 * Solo interesan las "ifc_property" — las "builtin" no se resuelven
 * ahí (sus valores salen directo de los 8 campos fijos del grupo), así
 * que filtrarlas acá evita mandar ruido en el body.
 *
 * ⚠️ El backend valida "columns" con el mismo schema que las
 * plantillas (TemplateColumnInputSchema, unión discriminada por
 * source_type) — hacen falta source_type y column_order acá, aunque
 * el servicio no los use para nada semánticamente en este endpoint,
 * porque sin ellos Zod rechaza la unión completa con 400 antes de
 * mirar siquiera property_set_name. property_set_name: "" SÍ es
 * válido (confirmado en el schema real: z.string() sin .min(1),
 * espeja el CHECK de la tabla que solo exige NOT NULL) — no hace
 * falta mandar null ni ningún truco raro ahí.
 */
export function templateColumnsToPartidaRequest(
  sets: TemplateSet[]
): PartidaColumnRequest[] {
  return sets
    .flatMap((set) => set.columns)
    .filter((col): col is TemplateColumn & { source_type: 'ifc_property' } => col.source_type === 'ifc_property')
    .map((col, idx) => ({
      name: col.name,
      source_type: 'ifc_property' as const,
      property_set_name: col.property_set_name ?? '',
      property_name: col.property_name ?? '',
      column_order: idx + 1,
    }));
}

/**
 * Convierte los sets/columnas "en memoria" (la forma con
 * template_column_id opcional que devuelve getTemplate) al payload
 * que esperan createTemplate/replaceTemplateColumns — reindexa
 * sort_order/column_order 1..n como corresponde. Antes vivía como
 * función local dentro de TemplateEditor.tsx (buildPayload); se
 * extrajo acá para poder guardar también desde PartidasTree.tsx (el
 * botón "Guardar plantilla" al lado de "Eliminar archivo", sin pasar
 * por el modal del editor).
 */
export function toTemplateSetsInput(sets: TemplateSet[]): TemplateSetInput[] {
  return sets
    // Nunca mandar un set sin columnas — el backend exige mínimo 1
    // (TemplateSetInputSchema, "Cada set necesita al menos una
    // columna") y lo rechaza con 400 sin poder guardar nada. Puede
    // pasar si se agrega y después se borra la única columna de un set
    // que se creó al vuelo desde el catálogo — el set queda huérfano,
    // vacío, dando vueltas en memoria hasta que alguien intenta
    // guardar. Se filtra acá, en el último paso antes de mandar al
    // backend, así nunca se cuela sin importar de dónde vino.
    .filter((s) => s.columns.length > 0)
    .map((s, i) => ({
      name: s.name,
      sort_order: i + 1,
      columns: s.columns.map((c, j) => ({
        name: c.name,
        source_type: c.source_type,
        builtin_field: c.builtin_field ?? undefined,
        property_set_name: c.property_set_name ?? undefined,
        property_name: c.property_name ?? undefined,
        column_order: j + 1,
        is_visible: c.is_visible,
      })),
    }));
}

/**
 * Todas las columnas visibles de una plantilla, en orden, aplanadas
 * (sin la agrupación por set) — para recorrer una sola vez al pintar
 * el header y las filas de la tabla.
 */
export function flattenVisibleColumns(sets: TemplateSet[]): TemplateColumn[] {
  return [...sets]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((set) =>
      [...set.columns]
        .filter((col) => col.is_visible)
        .sort((a, b) => a.column_order - b.column_order)
    );
}