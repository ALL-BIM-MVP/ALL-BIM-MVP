import pool from "../db/database.js";
import { AppError } from "../models/errors/app-error.js";
import { IFC_METRADOS_ERRORS } from "../models/errors/ifc-metrados.errors.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { IfcFileIdParam, PartidaElementsBody, PartidaIdParam } from "../schemas/ifc-metrados.schema.js";
import { GROUP_BY_FIELDS } from "../schemas/ifc-metrados.schema.js";
import {
    buildPartidaTree, groupPartidaElements,
    type PartidaElementRow, type PartidaElementsDetail, type PartidaTreeNode, type PartidaTreeRow,
    type ResolvedPropertyColumn
} from "../models/metrado-partidas.models.js";
import type { TemplatePropertyColumnRef } from "../models/templates.models.js";
import { assertIfcFileAccess } from "./ifc-metrados.service.js";
import { getTemplatePropertyColumnsService } from "./templates.service.js";

export const getPartidasTreeService = async (
    user : DecodedToken, { ifcFileId } : IfcFileIdParam
) : Promise<PartidaTreeNode[]> => {

    await assertIfcFileAccess(ifcFileId, user.user_id);

    const result = await pool.query<PartidaTreeRow>(
        `SELECT p.partida_id, p.parent_id, p.code, p.description, p.unit, p.sort_order,
            COALESCE(t.element_count, 0) AS element_count, t.total
        FROM metrado_partidas p
        LEFT JOIN metrado_partida_totals t ON t.partida_id = p.partida_id
        WHERE p.ifc_file_id = $1
        ORDER BY p.sort_order`,
        [ifcFileId]
    );

    return buildPartidaTree(result.rows);
};

// "<property_set>::<property_name>" — clave estable para el pivot en
// memoria y para lo que ve el frontend en resolved_properties[].key /
// group.properties[key]. property_set puede ser "" (propiedad suelta,
// sin Pset) y sigue siendo única igual, porque (ifc_file_id,
// property_set, property_name) es UNIQUE en la tabla real.
const propertyKey = (propertySet : string, propertyName : string) : string => `${propertySet}::${propertyName}`;

// De dónde salen las columnas de propiedad a resolver: una plantilla
// YA GUARDADA (template_id) o la "plantilla en ejecución" armada en
// memoria por el frontend (columns inline) — el schema ya garantiza que
// no vengan los dos juntos (ver PartidaElementsBodySchema). Ninguno de
// los dos -> sin columnas de propiedad, comportamiento idéntico al de
// antes de que existiera este mecanismo.
const resolvePropertyRefs = async (
    user : DecodedToken, { template_id : templateId, columns } : PartidaElementsBody
) : Promise<TemplatePropertyColumnRef[]> => {
    if (templateId !== undefined) {
        return getTemplatePropertyColumnsService(user, templateId);
    }
    if (columns && columns.length > 0) {
        return columns
            .filter((col) => col.source_type === "ifc_property")
            .map((col) => ({ name: col.name, property_set_name: col.property_set_name, property_name: col.property_name }));
    }
    return [];
};

// El corazón del patrón "3 queries + pivot en memoria" en vez de un
// JOIN por columna de propiedad (que degeneraría con muchas columnas
// en la plantilla — ver la explicación completa que motivó esto).
// QUERY 2 acá abajo: en vez de resolver property_id con un
// WHERE (property_set,property_name) = ANY(tuplas) [complicado de
// bindear bien con node-pg], se trae TODO el catálogo de propiedades
// de este archivo (typ. unas pocas centenas de filas, ya lo probamos
// con un archivo real: 142) y se resuelve en memoria — más simple, y
// sigue siendo una sola query.
const resolvePropertyValues = async (
    ifcFileId : number, elementIds : readonly number[], propertyRefs : readonly TemplatePropertyColumnRef[]
) : Promise<{
    propertyValuesByElement : Map<string, Map<string, string | null>>;
    resolvedProperties : ResolvedPropertyColumn[];
}> => {
    if (propertyRefs.length === 0) {
        return { propertyValuesByElement: new Map(), resolvedProperties: [] };
    }

    const catalogResult = await pool.query<{ property_id : string; property_set : string; property_name : string }>(
        `SELECT property_id, property_set, property_name FROM ifc_properties WHERE ifc_file_id = $1`,
        [ifcFileId]
    );

    const idByKey = new Map<string, string>();
    for (const row of catalogResult.rows) idByKey.set(propertyKey(row.property_set, row.property_name), row.property_id);

    const resolvedProperties : ResolvedPropertyColumn[] = propertyRefs.map((ref) => {
        const key = propertyKey(ref.property_set_name, ref.property_name);
        return {
            key, name: ref.name,
            property_set_name: ref.property_set_name, property_name: ref.property_name,
            found: idByKey.has(key),
        };
    });

    const idToKey = new Map<string, string>();
    for (const resolved of resolvedProperties) {
        if (resolved.found) idToKey.set(idByKey.get(resolved.key)!, resolved.key);
    }
    const foundIds = [...idToKey.keys()];

    const propertyValuesByElement = new Map<string, Map<string, string | null>>();

    if (foundIds.length > 0 && elementIds.length > 0) {
        // QUERY 3 — todos los valores relevantes en una sola pasada
        // (element_id × property_id pedidos), acotada porque el detalle
        // ya es lazy-load por partida (nunca son TODOS los elementos del
        // archivo, solo los de esta partida).
        const valuesResult = await pool.query<{ element_id : string; property_id : string; value : string }>(
            `SELECT epv.element_id, epv.property_id, pv.value
            FROM ifc_element_property_values epv
            INNER JOIN ifc_property_values pv ON pv.value_id = epv.value_id AND pv.property_id = epv.property_id
            WHERE epv.element_id = ANY($1::BIGINT[]) AND epv.property_id = ANY($2::BIGINT[])`,
            [elementIds, foundIds]
        );

        for (const row of valuesResult.rows) {
            const key = idToKey.get(row.property_id);
            if (!key) continue;
            const elementKey = String(row.element_id);
            let valuesForElement = propertyValuesByElement.get(elementKey);
            if (!valuesForElement) {
                valuesForElement = new Map();
                propertyValuesByElement.set(elementKey, valuesForElement);
            }
            valuesForElement.set(key, row.value);
        }
    }

    return { propertyValuesByElement, resolvedProperties };
};

export const getPartidaElementsService = async (
    user : DecodedToken, { ifcFileId, partidaId } : PartidaIdParam, body : PartidaElementsBody
) : Promise<PartidaElementsDetail> => {

    await assertIfcFileAccess(ifcFileId, user.user_id);

    const partidaResult = await pool.query<{ unit : string | null }>(
        `SELECT unit FROM metrado_partidas WHERE partida_id = $1 AND ifc_file_id = $2`,
        [partidaId, ifcFileId]
    );

    const partida = partidaResult.rows[0];

    if (!partida) throw new AppError(IFC_METRADOS_ERRORS.PARTIDA_NOT_FOUND);

    const result = await pool.query<PartidaElementRow>(
        `SELECT e.element_id, e.express_id, e.name, e.level_name, e.space_name, e.tag,
            me.length, me.run_length, me.width, me.height, me.diameter, me.quantity, me.area, me.volume, me.weight
        FROM metrado_elements me
        JOIN ifc_elements e ON e.element_id = me.element_id
        WHERE me.partida_id = $1
        ORDER BY e.level_name, e.space_name, e.tag, e.element_id`,
        [partidaId]
    );

    const propertyRefs = await resolvePropertyRefs(user, body);
    const { propertyValuesByElement, resolvedProperties } = await resolvePropertyValues(
        ifcFileId, result.rows.map((row) => row.element_id), propertyRefs
    );
    const propertyKeys = resolvedProperties.map((resolved) => resolved.key);

    const groupBy = body.group_by && body.group_by.length > 0 ? body.group_by : GROUP_BY_FIELDS;
    const groups = groupPartidaElements(result.rows, groupBy, partida.unit, propertyValuesByElement, propertyKeys);

    // Ya no se devuelve "total" acá (ver comentario en PartidaElementsDetail)
    // — ese valor ya lo trae PartidaTreeNode.total desde el árbol.
    return { partida_id: partidaId, unit: partida.unit, resolved_properties: resolvedProperties, groups };
};
