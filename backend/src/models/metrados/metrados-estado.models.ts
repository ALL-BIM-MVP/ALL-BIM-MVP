// metrados-estado.models.ts
//
// "Muestra de estado de cantidad de elementos" — prototipo de consulta
// dinámica (no persiste nada, se recalcula en cada request) para
// detectar dos problemas de calidad de datos a nivel de PROYECTO
// (todos los archivos IFC procesados del proyecto, no uno solo):
//
//   1) "elemento conjunto" repetido — la clave armada con los campos
//      configurados (ver elemento-conjunto.models.ts) vuelve a
//      aparecer más de una vez.
//   2) "elemento conjunto" incompleto — a alguno de los campos
//      configurados le falta un valor para ese elemento.
//
// Solo se reportan filas con AL MENOS uno de los dos problemas — un
// elemento sin repetir y con todos los campos completos no aparece en
// la respuesta (ver construirEstadoElementos).
//
// La CLAVE en sí (qué campos la componen) es dinámica desde
// 2026-08-23 — antes eran 4 campos fijos hardcodeados acá mismo
// (archivo+guid+tag+código). Se corrigió porque ese criterio fijo no
// alcanza para todos los casos reales (ver
// docs/roadmap/consolidacion-y-hardening.md, punto 1) — ahora sale de
// elemento_conjunto_config_fields (elemento-conjunto.service.ts),
// configurable por proyecto, con los mismos 4 campos como default.

import { etiquetaCampoElementoConjunto, type ElementoConjuntoFieldRow } from "./elemento-conjunto.models.js";

// Un valor por cada campo configurado, en el MISMO ORDEN que
// `fields` — construirEstadoElementos empareja por posición (índice),
// no por nombre, así que el llamador tiene que armar este array
// respetando el orden de `fields` tal cual vino de la config.
export interface ElementoConjuntoRow {
    element_id: string;
    values: (string | null)[];
}

export interface ElementoConjuntoProblema {
    elemento_conjunto: string;
    // null si este "elemento conjunto" no se repitió (apareció 1 sola
    // vez) — solo lleva un entero > 1 cuando sí hay repetidos.
    repetidos: number | null;
    // Etiquetas de qué campos vinieron vacíos para este elemento (ver
    // etiquetaCampoElementoConjunto) — ausente por completo (no la
    // clave, no un array vacío) si no falta ninguno.
    faltantes?: string[];
}

export interface EstadoElementosResult {
    project_id: number;
    // Qué campos formaron la clave para este cálculo — eco de la
    // config usada, en el mismo orden, para que el frontend pueda
    // etiquetar sin tener que pedir la config aparte.
    campos_clave: string[];
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

const CAMPOS_FALTANTES = (row: ElementoConjuntoRow, fields: ElementoConjuntoFieldRow[]): string[] => {
    const faltan: string[] = [];
    row.values.forEach((value, i) => {
        if (!value) faltan.push(etiquetaCampoElementoConjunto(fields[i]!));
    });
    return faltan;
};

// "elemento conjunto" = valores unidos con guion, en el orden de
// `fields`. Un componente faltante queda como string vacío (no la
// palabra "null" — eso sería indistinguible de un valor real que
// literalmente dijera "null") — así el hueco se ve a simple vista
// como un "--" en la cadena resultante.
const construirElementoConjunto = (row: ElementoConjuntoRow): string => row.values.map((v) => v ?? "").join("-");

export const construirEstadoElementos = (
    projectId: number, fields: ElementoConjuntoFieldRow[], rows: ElementoConjuntoRow[]
): EstadoElementosResult => {
    // Agrupa por la cadena ya armada — dos filas con los mismos
    // valores en los campos configurados dan la MISMA cadena, así que
    // agrupar por string ya agrupa por la tupla completa a la vez. Se
    // guarda una fila representativa por grupo (todas las del grupo
    // son idénticas en estos campos, así que cualquiera sirve para
    // calcular faltantes).
    const grupos = new Map<string, { count: number; row: ElementoConjuntoRow }>();
    for (const row of rows) {
        const clave = construirElementoConjunto(row);
        const existente = grupos.get(clave);
        if (existente) existente.count += 1;
        else grupos.set(clave, { count: 1, row });
    }

    const resultados: ElementoConjuntoProblema[] = [];
    for (const [elementoConjunto, { count, row }] of grupos) {
        const faltantes = CAMPOS_FALTANTES(row, fields);
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
        campos_clave: fields.map(etiquetaCampoElementoConjunto),
        total_elementos_evaluados: rows.length,
        elementos_conjunto_unicos: grupos.size,
        con_problemas: resultados.length,
        resultados,
    };
};
