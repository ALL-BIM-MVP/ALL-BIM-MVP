// metrados-estado.models.ts
//
// "Muestra de estado de cantidad de elementos" — prototipo de consulta
// dinámica (no persiste nada, se recalcula en cada request) para
// detectar dos problemas de calidad de datos a nivel de PROYECTO
// (todos los archivos IFC procesados del proyecto, no uno solo):
//
//   1) "elemento conjunto" repetido — la concatenación
//      <archivo>-<guid>-<tag>-<código> vuelve a aparecer más de una
//      vez. Un GUID (global_id) está pensado para ser único por
//      elemento IFC — si el mismo archivo trae el mismo GUID más de
//      una vez (o el archivo se subió/procesó dos veces sin limpiar la
//      versión vieja), esto lo detecta.
//   2) "elemento conjunto" incompleto — a alguno de los 4 valores que
//      lo forman le falta un dato (típicamente tag, que es nullable).
//
// Solo se reportan filas con AL MENOS uno de los dos problemas — un
// elemento sin repetir y con los 4 valores completos no aparece en la
// respuesta (ver construirEstadoElementos).

export interface ElementoConjuntoRow {
    file_name: string;
    global_id: string | null;
    tag: string | null;
    partida_code: string;
}

export interface ElementoConjuntoProblema {
    elemento_conjunto: string;
    // null si este "elemento conjunto" no se repitió (apareció 1 sola
    // vez) — solo lleva un entero > 1 cuando sí hay repetidos.
    repetidos: number | null;
    // Lista de cuáles de los 4 componentes vinieron vacíos para este
    // elemento — "archivo" | "guid" | "tag" | "codigo". Ausente por
    // completo (no la clave, no un array vacío) si no falta ninguno.
    faltantes?: string[];
}

export interface EstadoElementosResult {
    project_id: number;
    // Cuántas filas de metrado_elements se evaluaron en total (across
    // todos los archivos IFC procesados del proyecto).
    total_elementos_evaluados: number;
    // Cuántos "elemento conjunto" DISTINTOS salieron de esas filas —
    // si total_elementos_evaluados > elementos_conjunto_unicos, hay
    // repetidos por definición.
    elementos_conjunto_unicos: number;
    // Cuántos de esos distintos tienen algún problema (repetido y/o
    // incompleto) — es simplemente resultados.length, pero se deja
    // explícito para no obligar al frontend a contar el array.
    con_problemas: number;
    resultados: ElementoConjuntoProblema[];
}

const CAMPOS_FALTANTES = (row: ElementoConjuntoRow): string[] => {
    const faltan: string[] = [];
    if (!row.file_name) faltan.push("archivo");
    if (!row.global_id) faltan.push("guid");
    if (!row.tag) faltan.push("tag");
    if (!row.partida_code) faltan.push("codigo");
    return faltan;
};

// "elemento conjunto" = <archivo>-<guid>-<tag>-<código>, unidos con
// guion. Un componente faltante queda como string vacío (no la
// palabra "null" — eso sería indistinguible de un valor real que
// literalmente dijera "null") — así el hueco se ve a simple vista
// como un "--" en la cadena resultante.
const construirElementoConjunto = (row: ElementoConjuntoRow): string =>
    [row.file_name ?? "", row.global_id ?? "", row.tag ?? "", row.partida_code ?? ""].join("-");

export const construirEstadoElementos = (
    projectId: number, rows: ElementoConjuntoRow[]
): EstadoElementosResult => {
    // Agrupa por la cadena ya armada — dos filas con el mismo archivo/
    // guid/tag/código dan la MISMA cadena, así que agrupar por string
    // ya agrupa por la tupla de los 4 campos a la vez. Se guarda una
    // fila representativa por grupo (todas las del grupo son idénticas
    // en estos 4 campos, así que cualquiera sirve para calcular
    // faltantes).
    const grupos = new Map<string, { count: number; row: ElementoConjuntoRow }>();
    for (const row of rows) {
        const clave = construirElementoConjunto(row);
        const existente = grupos.get(clave);
        if (existente) existente.count += 1;
        else grupos.set(clave, { count: 1, row });
    }

    const resultados: ElementoConjuntoProblema[] = [];
    for (const [elementoConjunto, { count, row }] of grupos) {
        const faltantes = CAMPOS_FALTANTES(row);
        if (count === 1 && faltantes.length === 0) continue; // sin problema, no se manda

        const entrada: ElementoConjuntoProblema = {
            elemento_conjunto: elementoConjunto,
            repetidos: count > 1 ? count : null,
        };
        if (faltantes.length > 0) entrada.faltantes = faltantes;
        resultados.push(entrada);
    }

    return {
        project_id: projectId,
        total_elementos_evaluados: rows.length,
        elementos_conjunto_unicos: grupos.size,
        con_problemas: resultados.length,
        resultados,
    };
};
