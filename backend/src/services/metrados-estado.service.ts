// metrados-estado.service.ts
//
// "Muestra de estado de cantidad de elementos" (prototipo) — ver el
// comentario de cabecera en models/metrados-estado.models.ts para la
// definición completa de "elemento conjunto" y qué se reporta.
import pool from "../db/database.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { ProjectIdParam } from "../schemas/projects.schema.js";
import {
    construirEstadoElementos,
    type ElementoConjuntoRow, type EstadoElementosResult,
} from "../models/metrados-estado.models.js";
import type { ElementoConjuntoFieldRow } from "../models/elemento-conjunto.models.js";
import { getElementoConjuntoConfigService } from "./elemento-conjunto.service.js";
import { assertModulePermission } from "./project-access.service.js";

// Es un reporte del módulo METRADOS BIM puntualmente — mismo criterio
// que el resto de ifc-metrados.service.ts.
const METRADOS_MODULE_CODE = "metrados";

// Fila base — un metrado_element con sus 4 valores builtin siempre
// disponibles de una (salen del mismo JOIN de siempre), más
// element_id para poder ir a buscar valores de propiedad después.
interface BaseElementRow {
    element_id: string;
    file_name: string;
    global_id: string | null;
    tag: string | null;
    partida_code: string;
}

const BUILTIN_COLUMN: Record<string, keyof BaseElementRow> = {
    file_name: "file_name", global_id: "global_id", tag: "tag", partida_code: "partida_code",
};

// Para cada campo tipo 'property' configurado, resuelve el valor de
// ESE elemento en UNA query (DISTINCT ON element_id — si property_set
// no se especificó, "cualquier Pset" puede matchear más de una fila
// por elemento, se toma una sola de forma determinística). No es el
// patrón "3 queries + pivot" de metrado-partidas.service.ts porque acá
// ya sabemos exactamente qué (property_set, property_name) buscar
// (vienen de la config), no hace falta resolver un catálogo primero —
// una query por campo de propiedad configurado (típicamente 0-3), no
// por elemento.
const resolvePropertyValues = async (
    projectId: number, propertySet: string | null, propertyName: string
): Promise<Map<string, string>> => {
    const { rows } = await pool.query<{ element_id: string; value: string }>(
        `SELECT DISTINCT ON (epv.element_id) epv.element_id, pv.value
        FROM ifc_element_property_values epv
        INNER JOIN ifc_property_values pv ON pv.value_id = epv.value_id AND pv.property_id = epv.property_id
        INNER JOIN ifc_properties ip ON ip.property_id = epv.property_id
        INNER JOIN ifc_elements el ON el.element_id = epv.element_id
        INNER JOIN ifc_files ifl ON ifl.ifc_file_id = el.ifc_file_id
        INNER JOIN files fl ON fl.file_id = ifl.ifc_file_id
        WHERE fl.project_id = $1 AND ifl.is_current = true
            AND ip.property_name = $2
            AND ($3::text IS NULL OR ip.property_set = $3)
        ORDER BY epv.element_id, ip.property_set NULLS FIRST`,
        [projectId, propertyName, propertySet]
    );

    const map = new Map<string, string>();
    for (const row of rows) map.set(row.element_id, row.value);
    return map;
};

export const getEstadoElementosService = async (
    user: DecodedToken, { projectId }: ProjectIdParam
): Promise<EstadoElementosResult> => {

    await assertModulePermission(projectId, user.user_id, METRADOS_MODULE_CODE, "view");

    const { fields } = await getElementoConjuntoConfigService(user, { projectId });

    // A nivel de PROYECTO (todos los archivos IFC ya procesados, no
    // uno solo) — por diseño: si el mismo elemento aparece en más de un
    // documento IFC (dos archivos DISTINTOS con el mismo elemento), esto
    // lo saca a la luz, que es justamente el tipo de problema que esta
    // consulta busca detectar.
    //
    // ifl.is_current = true (Fase 3) — con versionado, subir una
    // versión nueva de un documento ya NO deja a la vieja como "archivo
    // vivo" con datos cargados (el tombstone le borra los derivados, ver
    // insertarResultado en ifc-processing-runner.ts), así que este
    // filtro es en la práctica un no-op salvo por el rato entre que una
    // versión nueva termina de procesar y la vieja se apaga — se deja
    // explícito igual, no depender del efecto secundario del borrado.
    const { rows: baseRows } = await pool.query<BaseElementRow>(
        `SELECT
            e.element_id,
            fl.name AS file_name,
            e.global_id,
            e.tag,
            mp.code AS partida_code
        FROM metrado_elements me
        JOIN metrado_partidas mp ON mp.partida_id = me.partida_id
        JOIN ifc_elements e ON e.element_id = me.element_id
        JOIN ifc_files ifl ON ifl.ifc_file_id = e.ifc_file_id
        JOIN files fl ON fl.file_id = ifl.ifc_file_id
        WHERE fl.project_id = $1 AND ifl.is_current = true`,
        [projectId]
    );

    // Una query por campo tipo 'property' configurado — típicamente
    // 0-3, acotado por cuántos campos eligió el usuario, no por
    // cantidad de elementos.
    const propertyValuesByField = new Map<number, Map<string, string>>();
    for (let i = 0; i < fields.length; i++) {
        const field = fields[i]!;
        if (field.field_type === "property") {
            propertyValuesByField.set(i, await resolvePropertyValues(projectId, field.property_set, field.property_name!));
        }
    }

    const valueForField = (baseRow: BaseElementRow, field: ElementoConjuntoFieldRow, index: number): string | null => {
        if (field.field_type === "builtin") return baseRow[BUILTIN_COLUMN[field.builtin_field!]!] ?? null;
        return propertyValuesByField.get(index)?.get(baseRow.element_id) ?? null;
    };

    const rows: ElementoConjuntoRow[] = baseRows.map((baseRow) => ({
        element_id: baseRow.element_id,
        values: fields.map((field, i) => valueForField(baseRow, field, i)),
    }));

    return construirEstadoElementos(projectId, fields, rows);
};
