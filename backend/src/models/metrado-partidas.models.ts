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
    length : string | number | null;
    width : string | number | null;
    height : string | number | null;
    quantity : string | number | null;
    area : string | number | null;
    volume : string | number | null;
    weight : string | number | null;
};

interface PartidaElementItem {
    element_id : number;
    express_id : number;
    name : string | null;
    length : number | null;
    width : number | null;
    height : number | null;
    quantity : number | null;
    area : number | null;
    volume : number | null;
    weight : number | null;
};

export interface PartidaElementGroup {
    level_name : string | null;
    space_name : string | null;
    tag : string | null;
    element_count : number;
    // Estos 7 campos son los de UN elemento representativo del grupo
    // (no la suma) — ver comentario de groupPartidaElements.
    width : number | null;
    height : number | null;
    length : number | null;
    quantity : number | null;
    area : number | null;
    volume : number | null;
    weight : number | null;
    // metrado representativo (el que corresponde a la unidad de la
    // partida) × element_count — el único valor que sí se multiplica
    // por la cantidad de elementos del grupo.
    sub_total : number;
    elements : PartidaElementItem[];
};

export interface PartidaElementsDetail {
    partida_id : number;
    unit : string | null;
    // suma de sub_total de todos los grupos — en teoría coincide con el
    // total ya guardado en metrado_partida_totals para esta partida.
    total : number;
    groups : PartidaElementGroup[];
};

const toElementItem = (row : PartidaElementRow) : PartidaElementItem => ({
    element_id: row.element_id,
    express_id: row.express_id,
    name: row.name,
    length: toNumberOrNull(row.length),
    width: toNumberOrNull(row.width),
    height: toNumberOrNull(row.height),
    quantity: toNumberOrNull(row.quantity),
    area: toNumberOrNull(row.area),
    volume: toNumberOrNull(row.volume),
    weight: toNumberOrNull(row.weight),
});

// Mismo criterio que ifc-processing-runner.ts (UNIT_TO_METRADO_KEY) —
// qué metrado le corresponde mostrar a cada unidad de partida. Se repite
// acá (4 líneas) en vez de importarlo del runner para no acoplar el
// modelo de partidas al service de procesamiento.
const METRADO_KEY_POR_UNIDAD: Record<string, keyof PartidaElementItem> = {
    m: "length",
    m2: "area",
    m3: "volume",
    kg: "weight",
};

const round4 = (value : string | number | null) : number => {
    const n = toNumberOrNull(value) ?? 0;
    return Math.round(n * 10000) / 10000;
};

// Clave de agrupamiento: SIEMPRE incluye las dimensiones (Largo/Ancho/
// Alto, redondeadas) además de los campos pedidos en group_by. Mismo
// tag pero medidas distintas NO es el mismo grupo — si no, el "valor
// representativo de un solo elemento" que se usa más abajo no sería
// válido para todo el grupo (caso real: un mismo tag con varios juegos
// de medidas distintas en el mismo nivel/espacio, cada uno su propia
// fila en el Excel de referencia).
const dimsKey = (row : PartidaElementRow) : string =>
    `${round4(row.length)}|${round4(row.width)}|${round4(row.height)}`;

// Agrupa filas de elementos por los campos pedidos (nivel/espacio/tag,
// por defecto los 3) + dimensiones. Elementos con el mismo tag y las
// mismas medidas se asumen físicamente idénticos (misma familia/tipo
// repetida) — por eso los 7 campos de metrado que se muestran por grupo
// son los de UN solo elemento representativo, NO la suma de todos
// (sumarlos duplicaría el valor real — 9 barras de 2.14m no sumaban
// "19.28m" de largo, eso no significa nada). Lo único que sí se
// multiplica por la cantidad es sub_total, y solo con el metrado que
// corresponde a la unidad de la partida (m→length, m2→area, m3→volume,
// kg→weight, resto→quantity) — igual que en el Excel de referencia.
export const groupPartidaElements = (
    rows : PartidaElementRow[], groupBy : readonly GroupByField[], partidaUnit : string | null
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
        const elementos = rowsDelGrupo.map(toElementItem);
        const representativo = elementos[0]!;
        const valorMetrado = representativo[metradoKey] ?? 0;

        return {
            level_name: groupBy.includes("level_name") ? primero.level_name : null,
            space_name: groupBy.includes("space_name") ? primero.space_name : null,
            tag: groupBy.includes("tag") ? primero.tag : null,
            element_count: elementos.length,
            length: representativo.length,
            width: representativo.width,
            height: representativo.height,
            quantity: representativo.quantity,
            area: representativo.area,
            volume: representativo.volume,
            weight: representativo.weight,
            sub_total: (valorMetrado as number) * elementos.length,
            elements: elementos,
        };
    });
};
