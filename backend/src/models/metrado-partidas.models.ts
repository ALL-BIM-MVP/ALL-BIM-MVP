import type { GroupByField } from "../schemas/ifc-metrados.schema.js";

// NUMERIC en Postgres viaja como string por el driver (mismo motivo que
// BIGINT), pero acá SÍ hay que convertirlo: son medidas físicas
// (áreas/pesos/longitudes de elementos de una obra), nunca se acercan
// al límite de precisión de Number — a diferencia de un file_id, donde
// no convertir fue la decisión correcta, acá no convertir directamente
// rompe las sumas (concatenaría strings en vez de sumar).
const toNumberOrNull = (value: string | number | null): number | null =>
    value === null ? null : Number(value);

// ------------------------------------------------------------------
// GET /ifc-files/:id/partidas — árbol liviano (Resumido)
// ------------------------------------------------------------------
export interface PartidaTreeRow {
    partida_id: number;
    parent_id: number | null;
    code: string;
    description: string;
    unit: string | null;
    sort_order: number;
    element_count: number;
    total: string | number | null;
};

export interface PartidaTreeNode {
    partida_id: number;
    parent_id: number | null;
    code: string;
    description: string;
    unit: string | null;
    sort_order: number;
    element_count: number;
    total: number | null;
    children: PartidaTreeNode[];
};

// Arma el árbol (parent_id -> hijos) en memoria a partir de la lista
// plana — el Map preserva el orden de inserción, y la fila ya viene
// ordenada por sort_order desde la query, así que los children de cada
// nodo también quedan en el orden correcto sin ordenar de nuevo acá.
export const buildPartidaTree = (rows : PartidaTreeRow[]) : PartidaTreeNode[] => {
    const byId = new Map<number, PartidaTreeNode>();

    for (const row of rows) {
        byId.set(row.partida_id, {
            partida_id: row.partida_id,
            parent_id: row.parent_id,
            code: row.code,
            description: row.description,
            unit: row.unit,
            sort_order: row.sort_order,
            element_count: row.element_count,
            total: toNumberOrNull(row.total),
            children: []
        });
    }

    const roots : PartidaTreeNode[] = [];
    for (const node of byId.values()) {
        const parent = node.parent_id !== null ? byId.get(node.parent_id) : undefined;
        if (parent) parent.children.push(node);
        else roots.push(node);
    }
    return roots;
};

// ------------------------------------------------------------------
// POST /ifc-files/:id/partidas/:partidaId/elements — detalle (Detallado)
// ------------------------------------------------------------------
export interface PartidaElementRow {
    element_id : number;
    express_id : number;
    name : string | null;
    level_name : string | null;
    space_name : string | null;
    tag : string | null;
    // length/width/height = dimensiones BRUTAS de la caja envolvente
    // (Largo/Ancho/Alto), sin prioridad revit.
    length : string | number | null;
    width : string | number | null;
    height : string | number | null;
    // run_length = metrado "Longitud" (prioridad revit>geométrico) — NO
    // es lo mismo que length, aunque el fallback geométrico use el
    // mismo valor cuando revit no trae una IfcQuantityLength propia. Un
    // elemento curvo puede tener run_length > length.
    run_length : string | number | null;
    // Solo para elementos de perfil circular (tubos) — null para todo
    // lo demás, ver comentario en database/schema.sql.
    diameter : string | number | null;
    quantity : string | number | null;
    area : string | number | null;
    volume : string | number | null;
    weight : string | number | null;
    // De cuál de los 5 valores de arriba salió el metrado real de esta
    // partida, según su unidad — ver docs/roadmap/consolidacion-y-hardening.md
    // punto 6. 'tipado'|'geometrico'|'texto'|'default'|'acero'|
    // 'acero_diametro'|'acero_seccion'|null.
    origen_metrado : string | null;
};

interface PartidaElementItem {
    element_id : number;
    express_id : number;
    // "ID del elemento" para el cliente — es lo que de verdad lo
    // identifica (agrupar por tag es justo el criterio de
    // groupPartidaElements más abajo). "name" queda igual, capturado,
    // pero NUNCA es lo que se usa para identificar un elemento en
    // ningún lado — se repite entre elementos del mismo tipo/familia,
    // ver comentario de "DESCRIPCIÓN" en la plantilla del sistema
    // (system-data.sql).
    tag : string | null;
    name : string | null;
    length : number | null;
    run_length : number | null;
    width : number | null;
    height : number | null;
    diameter : number | null;
    quantity : number | null;
    area : number | null;
    volume : number | null;
    weight : number | null;
    origen_metrado : string | null;
    // Una entrada por cada columna "ifc_property" pedida (template_id o
    // columns inline), keyeada por "<property_set>::<property_name>" —
    // ver ResolvedPropertyColumn/resolvePropertyValues en el service.
    // Vacío {} si no se pidió ninguna. El valor SIEMPRE viaja como
    // string|null (así se guarda en ifc_property_values — sin casteo,
    // el frontend decide cómo mostrarlo/parsearlo).
    properties : Record<string, string | null>;
};

// Eco de qué columna de propiedad se pidió y si existe de verdad en
// ESTE archivo — found=false es la señal explícita de "la plantilla
// pide una propiedad que este IFC no tiene" (no se puede distinguir
// de otra forma un valor null "genuino" de un valor null "la
// propiedad no existe acá").
export interface ResolvedPropertyColumn {
    key : string;
    name : string;
    property_set_name : string;
    property_name : string;
    found : boolean;
};

export interface PartidaElementGroup {
    level_name : string | null;
    space_name : string | null;
    tag : string | null;
    element_count : number;
    // Estos 9 campos son los de UN elemento representativo del grupo
    // (no la suma) — ver comentario de groupPartidaElements.
    length : number | null;
    run_length : number | null;
    width : number | null;
    height : number | null;
    diameter : number | null;
    quantity : number | null;
    area : number | null;
    volume : number | null;
    weight : number | null;
    origen_metrado : string | null;
    // metrado representativo (el que corresponde a la unidad de la
    // partida) × element_count — el único valor que sí se multiplica
    // por la cantidad de elementos del grupo.
    sub_total : number;
    // Valor representativo del grupo para cada columna de propiedad
    // pedida = la MODA entre los elementos del grupo (el valor no-nulo
    // más frecuente) — mismo criterio de "representar sin sumar/perder
    // info" que ya se usa para length/width/etc, pero acá con moda en
    // vez de "el primer elemento" porque una propiedad de texto no
    // tiene un orden natural del que tomar "el primero" con sentido.
    properties : Record<string, string | null>;
    elements : PartidaElementItem[];
};

export interface PartidaElementsDetail {
    partida_id : number;
    unit : string | null;
    // NO va acá un "total" — sería el mismo valor repetido en las N
    // filas del detalle (suma de sub_total de todos los grupos), y esa
    // repetición fue justo lo que confundió al usuario ("¿por qué cada
    // fila muestra el total de toda la partida?"). Ese número YA existe,
    // una sola vez, en PartidaTreeNode.total (GET /ifc-files/:id/partidas
    // — viene de metrado_partida_totals, no hace falta recalcularlo ni
    // reenviarlo acá).
    // Qué columnas de propiedad se pidieron (vacío [] si ninguna) — el
    // frontend usa .key para leer group.properties[key]/element.properties[key],
    // y .found para saber si vale la pena pedirle a este archivo esa
    // columna en particular.
    resolved_properties : ResolvedPropertyColumn[];
    groups : PartidaElementGroup[];
};

// propertyValuesByElement: element_id (como string — BIGINT viaja como
// string desde el driver) -> key de propiedad -> valor. Viene ya
// pivoteado desde el service (QUERY 3 + Map en memoria), acá solo se
// lee.
type PropertyValuesByElement = Map<string, Map<string, string | null>>;

const toElementItem = (
    row : PartidaElementRow, propertyValuesByElement : PropertyValuesByElement, propertyKeys : readonly string[]
) : PartidaElementItem => {
    const valuesForElement = propertyValuesByElement.get(String(row.element_id));
    const properties : Record<string, string | null> = {};
    for (const key of propertyKeys) properties[key] = valuesForElement?.get(key) ?? null;

    return {
        element_id: row.element_id,
        express_id: row.express_id,
        tag: row.tag,
        name: row.name,
        length: toNumberOrNull(row.length),
        run_length: toNumberOrNull(row.run_length),
        width: toNumberOrNull(row.width),
        height: toNumberOrNull(row.height),
        diameter: toNumberOrNull(row.diameter),
        quantity: toNumberOrNull(row.quantity),
        area: toNumberOrNull(row.area),
        volume: toNumberOrNull(row.volume),
        weight: toNumberOrNull(row.weight),
        origen_metrado: row.origen_metrado,
        properties,
    };
};

// Moda (valor no-nulo más frecuente) de cada propiedad entre los
// elementos de un grupo — desempate por orden de aparición (los
// elementos ya vienen ordenados por la query, así que es determinístico).
// Si todos son null, la moda es null.
const modaProperties = (
    elementos : readonly PartidaElementItem[], propertyKeys : readonly string[]
) : Record<string, string | null> => {
    const result : Record<string, string | null> = {};

    for (const key of propertyKeys) {
        const counts = new Map<string, number>();
        const ordenDeAparicion : string[] = [];

        for (const el of elementos) {
            const value = el.properties[key] ?? null;
            if (value === null) continue;
            if (!counts.has(value)) ordenDeAparicion.push(value);
            counts.set(value, (counts.get(value) ?? 0) + 1);
        }

        if (ordenDeAparicion.length === 0) {
            result[key] = null;
            continue;
        }

        let moda = ordenDeAparicion[0]!;
        let mejorConteo = counts.get(moda)!;
        for (const value of ordenDeAparicion) {
            const conteo = counts.get(value)!;
            if (conteo > mejorConteo) {
                moda = value;
                mejorConteo = conteo;
            }
        }
        result[key] = moda;
    }

    return result;
};

// Mismo criterio que ifc-processing-runner.ts (UNIT_TO_METRADO_KEY) —
// qué metrado le corresponde mostrar a cada unidad de partida. Se repite
// acá (6 líneas) en vez de importarlo del runner para no acoplar el
// modelo de partidas al service de procesamiento. 'm' -> run_length
// (Longitud, el metrado real), NUNCA "length" (que es la dimensión
// bruta Largo). 'und' -> quantity ("Und.", builtin_field_catalog) — OJO,
// "quantity" es el METRADO de una partida 'und', no la cantidad de
// elementos agrupados (eso es element_count, un campo aparte, ver
// PartidaElementGroup — antes el catálogo confundía los dos bajo la
// misma etiqueta "Cant.").
const METRADO_KEY_POR_UNIDAD: Record<string, keyof PartidaElementItem> = {
    m: "run_length",
    m2: "area",
    m3: "volume",
    kg: "weight",
    und: "quantity",
};

const round4 = (value : string | number | null) : number => {
    const n = toNumberOrNull(value) ?? 0;
    return Math.round(n * 10000) / 10000;
};

// Clave de agrupamiento: SIEMPRE incluye las dimensiones brutas (Largo/
// Ancho/Alto/Diametro, redondeadas) además de los campos pedidos en
// group_by. Mismo tag pero medidas distintas NO es el mismo grupo — si
// no, el "valor representativo de un solo elemento" que se usa más
// abajo no sería válido para todo el grupo (caso real: un mismo tag
// con varios juegos de medidas distintas en el mismo nivel/espacio,
// cada uno su propia fila en el Excel de referencia). Usa las
// dimensiones brutas (length/width/height/diameter), no run_length —
// dos elementos pueden compartir caja envolvente pero tener una
// Longitud medida distinta (o viceversa), lo que define si son "el
// mismo elemento repetido" es la geometría. diameter entra acá aparte
// de width/height porque en un elemento circular esos dos quedan null
// (ver comentario en PartidaElementRow) — sin esta clave, dos tramos
// de tubería de distinto diámetro pero igual longitud se agruparían
// como si fueran el mismo elemento repetido.
const dimsKey = (row : PartidaElementRow) : string =>
    `${round4(row.length)}|${round4(row.width)}|${round4(row.height)}|${round4(row.diameter)}`;

// Agrupa filas de elementos por los campos pedidos (nivel/espacio/tag,
// por defecto los 3) + dimensiones. Elementos con el mismo tag y las
// mismas medidas se asumen físicamente idénticos (misma familia/tipo
// repetida) — por eso los 9 campos de metrado/dimensión que se muestran
// por grupo son los de UN solo elemento representativo, NO la suma de
// todos (sumarlos duplicaría el valor real — 9 barras de 2.14m no
// sumaban "19.28m" de longitud, eso no significa nada). Lo único que sí
// se multiplica por element_count es sub_total, y solo con el metrado
// que corresponde a la unidad de la partida (m→run_length, m2→area,
// m3→volume, kg→weight, und→quantity) — igual que en el Excel de
// referencia. element_count en sí (el "Cant." real, ver
// builtin_field_catalog) NO se multiplica por nada, es un conteo.
export const groupPartidaElements = (
    rows : PartidaElementRow[], groupBy : readonly GroupByField[], partidaUnit : string | null,
    propertyValuesByElement : PropertyValuesByElement = new Map(), propertyKeys : readonly string[] = []
) : PartidaElementGroup[] => {
    const metradoKey = partidaUnit ? (METRADO_KEY_POR_UNIDAD[partidaUnit] ?? "quantity") : "quantity";

    const buckets = new Map<string, PartidaElementRow[]>();
    for (const row of rows) {
        const key = [...groupBy.map((field) => String(row[field] ?? "")), dimsKey(row)].join(" ");
        const bucket = buckets.get(key);
        if (bucket) bucket.push(row);
        else buckets.set(key, [row]);
    }

    return [...buckets.values()].map((rowsDelGrupo) => {
        const primero = rowsDelGrupo[0]!;
        const elementos = rowsDelGrupo.map((row) => toElementItem(row, propertyValuesByElement, propertyKeys));
        const representativo = elementos[0]!;
        const valorMetrado = representativo[metradoKey] ?? 0;

        return {
            level_name: groupBy.includes("level_name") ? primero.level_name : null,
            space_name: groupBy.includes("space_name") ? primero.space_name : null,
            tag: groupBy.includes("tag") ? primero.tag : null,
            element_count: elementos.length,
            length: representativo.length,
            run_length: representativo.run_length,
            width: representativo.width,
            height: representativo.height,
            diameter: representativo.diameter,
            quantity: representativo.quantity,
            area: representativo.area,
            volume: representativo.volume,
            weight: representativo.weight,
            origen_metrado: representativo.origen_metrado,
            sub_total: (valorMetrado as number) * elementos.length,
            properties: modaProperties(elementos, propertyKeys),
            elements: elementos,
        };
    });
};

// ------------------------------------------------------------------
// GET /ifc-files/:id/elements/:expressId/metrado — metrado de un
// elemento puntual (mejoras-backend-post-auditoria.md, punto 1). Fila
// cruda: LEFT JOIN completo (ifc_elements -> metrado_elements ->
// metrado_partidas) — partida_id viene NULL cuando el elemento existe
// pero no está clasificado en ninguna partida (hoy no pasa nunca, ver
// docs/roadmap/mejoras-backend-post-auditoria.md punto 1: el pipeline
// de Python descarta los elementos que no logra clasificar ANTES de
// que lleguen a ifc_elements — pero el JOIN queda defensivo por si eso
// cambia algún día).
export interface ElementMetradoRow {
    express_id : number;
    tag : string | null;
    partida_id : number | null;
    code : string | null;
    description : string | null;
    unit : string | null;
    length : string | number | null;
    run_length : string | number | null;
    width : string | number | null;
    height : string | number | null;
    diameter : string | number | null;
    quantity : string | number | null;
    area : string | number | null;
    volume : string | number | null;
    weight : string | number | null;
    origen_metrado : string | null;
};

export interface ElementMetradoResult {
    express_id : number;
    tag : string | null;
    // null en los dos juntos (nunca uno sí y el otro no) — un solo
    // caso de "no hay nada para mostrar acá", sea porque el express_id
    // no existe en este archivo, sea porque existe pero no tiene
    // partida. El frontend no necesita (ni puede, con esta forma)
    // distinguir uno del otro — ver el roadmap, fue una decisión
    // explícita, no un descuido.
    partida : { partida_id : number; code : string; description : string; unit : string | null } | null;
    metrado : {
        length : number | null; run_length : number | null; width : number | null; height : number | null;
        diameter : number | null; quantity : number | null; area : number | null; volume : number | null;
        weight : number | null; origen_metrado : string | null;
    } | null;
};

export const transformElementMetrado = (
    expressId : number, row : ElementMetradoRow | undefined
) : ElementMetradoResult => {
    if (!row || row.partida_id === null) {
        return { express_id : expressId, tag : row?.tag ?? null, partida : null, metrado : null };
    }

    return {
        express_id : row.express_id,
        tag : row.tag,
        partida : {
            partida_id : row.partida_id,
            code : row.code as string,
            description : row.description as string,
            unit : row.unit,
        },
        metrado : {
            length : toNumberOrNull(row.length),
            run_length : toNumberOrNull(row.run_length),
            width : toNumberOrNull(row.width),
            height : toNumberOrNull(row.height),
            diameter : toNumberOrNull(row.diameter),
            quantity : toNumberOrNull(row.quantity),
            area : toNumberOrNull(row.area),
            volume : toNumberOrNull(row.volume),
            weight : toNumberOrNull(row.weight),
            origen_metrado : row.origen_metrado,
        },
    };
};
