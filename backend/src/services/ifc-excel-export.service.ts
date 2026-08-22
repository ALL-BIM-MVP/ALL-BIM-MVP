import ExcelJS from "exceljs";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pool from "../db/database.js";
import { AppError } from "../models/errors/app-error.js";
import { IFC_EXCEL_EXPORT_ERRORS } from "../models/errors/ifc-excel-export.errors.js";
import type { DecodedToken } from "../models/auth.models.js";
import type { IfcFileIdParam } from "../schemas/ifc-metrados.schema.js";
import { assertIfcFileAccess } from "./ifc-metrados.service.js";
import { computeChecksum } from "./files.service.js";
import { transformFileToFull, type FileFull, type FileRow } from "../models/files.models.js";
import {
    buildPartidaTree, groupPartidaElements,
    type PartidaElementGroup, type PartidaElementRow, type PartidaTreeNode, type PartidaTreeRow,
} from "../models/metrado-partidas.models.js";
import { UPLOADS_DIR } from "../middlewares/upload.midleware.js";

// Igual que METRADO_KEY_POR_UNIDAD en metrado-partidas.models.ts —
// repetido acá a propósito (6 líneas) en vez de exportarlo, mismo
// criterio de no acoplar este service al de partidas más de lo
// necesario (ver comentario original).
const METRADO_KEY_POR_UNIDAD: Record<string, keyof PartidaElementGroup> = {
    m: "run_length", m2: "area", m3: "volume", kg: "weight", und: "quantity",
};

interface ExportContext {
    project_id: number;
    project_name: string;
    project_location: string | null;
    specialty_name: string | null;
    uploaded_by: number;
}

// Calibri en vez de "Arial Narrow" (la fuente real del archivo de
// referencia) — pedido explícito: algo más neutral/estándar, no la
// fuente condensada específica de ese archivo.
const FONT_FAMILY = "Calibri";
const LABEL_FONT: Partial<ExcelJS.Font> = { name: FONT_FAMILY, size: 10, bold: true };
const BODY_FONT: Partial<ExcelJS.Font> = { name: FONT_FAMILY, size: 10 };
const THIN_BORDER: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" },
};

// Encabezados (título + fila de columnas) — fondo rojo oscuro, texto
// blanco negrita, confirmado con el archivo real (fill FFC00000, font
// FFFFFFFF).
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC00000" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { name: FONT_FAMILY, size: 10, bold: true, color: { argb: "FFFFFFFF" } };

const CENTRADO: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };

// includeEmpty: true — si no, ExcelJS solo itera celdas que ya tienen
// un valor asignado, dejando sin color de fondo las celdas vacías de
// una fila de sub-encabezado (ej. bajo "ITEM", que no tiene
// sub-columna) — se vería como un tablero de ajedrez rojo/blanco en
// vez de una banda continua. Centrado + fila más alta para que se note
// que es un encabezado, no una fila de datos más.
const aplicarEstiloEncabezado = (row: ExcelJS.Row): void => {
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = HEADER_FONT; cell.fill = HEADER_FILL; cell.border = THIN_BORDER; cell.alignment = CENTRADO;
    });
};

// Mismo criterio para la banda del título (fila 1, "RESUMEN DE
// METRADOS"/"PLANILLA DE METRADOS") — a diferencia de una fila con
// mergeCells simple, acá se pinta CADA celda del rango (no solo la de
// arriba-a-la-izquierda) para que el color de fondo no se corte a la
// mitad del rango combinado en algunos visores.
const estilarBandaTitulo = (ws: ExcelJS.Worksheet, rowNumber: number, colInicio: number, colFin: number): void => {
    const row = ws.getRow(rowNumber);
    row.height = 24;
    for (let c = colInicio; c <= colFin; c++) {
        const cell = row.getCell(c);
        cell.fill = HEADER_FILL;
        cell.font = { name: FONT_FAMILY, size: 12, bold: true, color: { argb: "FFFFFFFF" } };
        cell.alignment = CENTRADO;
    }
};

// Un color de fuente distinto por nivel de profundidad del árbol —
// confirmado con el archivo real (rojo/azul/verde/magenta para los 4
// niveles que tiene ESE archivo puntual) — acá se deja como paleta que
// cicla, por si algún árbol real llega más profundo.
const COLORES_POR_PROFUNDIDAD = ["FFFF0000", "FF0000FF", "FF008200", "FFFF66FF", "FFFF8C00", "FF7030A0"];
const colorProfundidad = (profundidad: number): Partial<ExcelJS.Font> => ({
    name: FONT_FAMILY, size: 10,
    color: { argb: COLORES_POR_PROFUNDIDAD[profundidad % COLORES_POR_PROFUNDIDAD.length]! },
});

// Encabezado — mismo bloque de campos que el Excel de referencia
// (Fase 5, "3.0 METRADOS DE ARQUITECTURA.xlsx"), en las mismas
// posiciones relativas. Los campos que no tenemos en "projects"
// (Sub Presp/Entidad/Bloque/Departamento/Provincia/Distrito) quedan
// con la etiqueta pero SIN valor — nunca se inventan. Arranca directo
// en la fila 1 (título) — el archivo de referencia tenía 2 filas
// vacías antes del título sin ningún propósito visible, no se
// replican (lo importante del formato es el contenido, no copiar
// filas en blanco porque sí).
const escribirEncabezado = (ws: ExcelJS.Worksheet, titulo: string, ctx: ExportContext, fecha: Date): void => {
    ws.mergeCells("A1:D1");
    ws.getCell("A1").value = titulo;
    estilarBandaTitulo(ws, 1, 1, 4);

    ws.getCell("A2").value = "Proyecto:";
    ws.getCell("A2").font = LABEL_FONT;
    ws.mergeCells("B2:D2");
    ws.getCell("B2").value = ctx.project_name.toUpperCase();
    ws.getCell("B2").font = BODY_FONT;

    ws.getCell("A3").value = "Sub Presp:";
    ws.getCell("A3").font = LABEL_FONT;
    ws.getCell("C3").value = "Departamento:";
    ws.getCell("C3").font = LABEL_FONT;

    ws.getCell("A4").value = "Entidad:";
    ws.getCell("A4").font = LABEL_FONT;
    ws.getCell("C4").value = "Provincia:";
    ws.getCell("C4").font = LABEL_FONT;

    ws.getCell("A5").value = "Especialidad:";
    ws.getCell("A5").font = LABEL_FONT;
    ws.getCell("B5").value = ctx.specialty_name?.toUpperCase() ?? "";
    ws.getCell("B5").font = BODY_FONT;
    ws.getCell("C5").value = "Distrito:";
    ws.getCell("C5").font = LABEL_FONT;

    ws.getCell("A6").value = "Bloque:";
    ws.getCell("A6").font = LABEL_FONT;
    ws.getCell("C6").value = "Lugar:";
    ws.getCell("C6").font = LABEL_FONT;
    ws.getCell("D6").value = ctx.project_location?.toUpperCase() ?? "";
    ws.getCell("D6").font = BODY_FONT;

    ws.getCell("A7").value = "Fecha:";
    ws.getCell("A7").font = LABEL_FONT;
    ws.getCell("B7").value = fecha;
    ws.getCell("B7").font = BODY_FONT;
    ws.getCell("B7").numFmt = "dd/mm/yyyy";
};

const round2 = (value: number | null): number | null => (value === null ? null : Math.round(value * 100) / 100);

// ------------------------------------------------------------------
// Hoja "Resumido" — árbol completo (carpetas + hojas), mismo dato que
// ya devuelve GET /ifc-files/:id/partidas (PartidaTreeNode.total), acá
// solo se vuelca a celdas.
// ------------------------------------------------------------------
const escribirResumen = (wb: ExcelJS.Workbook, ctx: ExportContext, fecha: Date, arbol: PartidaTreeNode[]): void => {
    const ws = wb.addWorksheet("Resumido");
    ws.getColumn(1).width = 16;
    ws.getColumn(2).width = 70;
    ws.getColumn(3).width = 14;
    ws.getColumn(4).width = 16;

    escribirEncabezado(ws, "RESUMEN DE METRADOS", ctx, fecha);

    const headerRow = ws.getRow(9);
    headerRow.getCell(1).value = "ITEM";
    headerRow.getCell(2).value = "DESCRIPCIÓN";
    headerRow.getCell(3).value = "UND";
    headerRow.getCell(4).value = "TOTAL";
    aplicarEstiloEncabezado(headerRow);

    let fila = 10;
    const escribirNodo = (nodo: PartidaTreeNode, profundidad: number): void => {
        const row = ws.getRow(fila++);
        row.getCell(1).value = nodo.code;
        row.getCell(2).value = nodo.description;
        row.getCell(2).alignment = { indent: profundidad };
        row.getCell(1).font = colorProfundidad(profundidad);
        row.getCell(2).font = colorProfundidad(profundidad);
        if (nodo.unit) {
            row.getCell(3).value = nodo.unit;
            row.getCell(3).font = colorProfundidad(profundidad);
            row.getCell(4).value = round2(nodo.total);
            row.getCell(4).font = colorProfundidad(profundidad);
        }
        for (const hijo of nodo.children) escribirNodo(hijo, profundidad + 1);
    };
    for (const raiz of arbol) escribirNodo(raiz, 0);
};

// ------------------------------------------------------------------
// Hoja "Detallado" — una fila de partida hoja (con TOTAL) seguida de
// una fila por grupo de elementos (tag+dimensiones, ver
// groupPartidaElements) — SIN sub-encabezado de nivel/espacio por
// ahora (a propósito, ver docs/roadmap-modulos-y-permisos.md Fase 5).
// DESCRIPCIÓN en la fila de partida = descripción de la partida;
// DESCRIPCIÓN en la fila de elemento = tag (nunca el "name" del IFC,
// se repite entre elementos y no identifica nada — mismo criterio que
// la plantilla "Detallado (default)" corregida en system-data.sql).
// ------------------------------------------------------------------
const escribirDetalle = (
    wb: ExcelJS.Workbook, ctx: ExportContext, fecha: Date,
    arbol: PartidaTreeNode[], gruposPorPartida: Map<number, PartidaElementGroup[]>
): void => {
    const ws = wb.addWorksheet("Detallado");
    ws.getColumn(1).width = 14;  // ITEM
    ws.getColumn(2).width = 40;  // DESCRIPCIÓN
    ws.getColumn(3).width = 8;   // UND
    ws.getColumn(4).width = 8;   // Cant.
    ws.getColumn(5).width = 9;   // Largo
    ws.getColumn(6).width = 9;   // Ancho
    ws.getColumn(7).width = 9;   // Altura
    for (let c = 8; c <= 12; c++) ws.getColumn(c).width = 9; // Lon./Área/Vol./Kg./Und.
    ws.getColumn(13).width = 12; // Sub Total
    ws.getColumn(14).width = 12; // TOTAL

    ws.mergeCells("A1:N1");
    ws.getCell("A1").value = "PLANILLA DE METRADOS";
    estilarBandaTitulo(ws, 1, 1, 14);

    ws.getCell("A2").value = "Proyecto:";
    ws.getCell("A2").font = LABEL_FONT;
    ws.mergeCells("B2:N2");
    ws.getCell("B2").value = ctx.project_name.toUpperCase();
    ws.getCell("B2").font = BODY_FONT;

    ws.mergeCells("E3:G3");
    ws.mergeCells("H3:L3");
    ws.mergeCells("A3:A4");
    ws.mergeCells("B3:B4");
    ws.mergeCells("C3:C4");
    ws.mergeCells("D3:D4");
    ws.mergeCells("M3:M4");
    ws.mergeCells("N3:N4");
    ws.getCell("A3").value = "ITEM";
    ws.getCell("B3").value = "DESCRIPCIÓN";
    ws.getCell("C3").value = "UND";
    ws.getCell("D3").value = "Cant.";
    ws.getCell("E3").value = "DIMENSIONES";
    ws.getCell("H3").value = "METRADO";
    ws.getCell("M3").value = "Sub Total";
    ws.getCell("N3").value = "TOTAL";
    ws.getRow(4).getCell(5).value = "Largo";
    ws.getRow(4).getCell(6).value = "Ancho";
    ws.getRow(4).getCell(7).value = "Altura";
    ws.getRow(4).getCell(8).value = "Lon.";
    ws.getRow(4).getCell(9).value = "Área";
    ws.getRow(4).getCell(10).value = "Vol.";
    ws.getRow(4).getCell(11).value = "Kg.";
    ws.getRow(4).getCell(12).value = "Und.";
    // Filas 3 y 4 son las DOS filas de encabezado (ITEM/DESCRIPCIÓN/...
    // en 3, Largo/Ancho/... en 4) — ANTES esto pintaba las filas 4 y 5
    // por error: la fila 3 (el encabezado real) quedaba sin pintar, y
    // la fila 5 (la primera fila de DATOS, "let fila = 5" más abajo)
    // se pintaba de rojo como si fuera parte del encabezado.
    aplicarEstiloEncabezado(ws.getRow(3));
    aplicarEstiloEncabezado(ws.getRow(4));

    let fila = 5;
    const metradoColByField: Record<keyof PartidaElementGroup, number> = {
        run_length: 8, area: 9, volume: 10, weight: 11, quantity: 12,
    } as Record<keyof PartidaElementGroup, number>;

    const escribirNodo = (nodo: PartidaTreeNode, profundidad: number): void => {
        if (nodo.unit) {
            const row = ws.getRow(fila++);
            row.getCell(1).value = nodo.code;
            row.getCell(1).font = colorProfundidad(profundidad);
            row.getCell(2).value = nodo.description;
            row.getCell(2).font = colorProfundidad(profundidad);
            row.getCell(3).value = nodo.unit;
            row.getCell(3).font = colorProfundidad(profundidad);
            row.getCell(14).value = round2(nodo.total);
            row.getCell(14).font = colorProfundidad(profundidad);

            const metradoKey = METRADO_KEY_POR_UNIDAD[nodo.unit] ?? "quantity";
            const grupos = gruposPorPartida.get(nodo.partida_id) ?? [];
            for (const grupo of grupos) {
                const detalle = ws.getRow(fila++);
                detalle.font = BODY_FONT;
                detalle.getCell(2).value = grupo.tag ?? "";
                detalle.getCell(3).value = nodo.unit;
                detalle.getCell(4).value = grupo.element_count;
                detalle.getCell(5).value = round2(grupo.length);
                detalle.getCell(6).value = round2(grupo.width);
                detalle.getCell(7).value = round2(grupo.height);
                const columna = metradoColByField[metradoKey as keyof PartidaElementGroup];
                const valor = grupo[metradoKey] as number | null;
                if (columna) detalle.getCell(columna).value = round2(valor);
                detalle.getCell(13).value = round2(grupo.sub_total);
            }
        }
        for (const hijo of nodo.children) escribirNodo(hijo, profundidad + 1);
    };
    for (const raiz of arbol) escribirNodo(raiz, 0);
};

export const generateExcelExportService = async (
    user: DecodedToken, { ifcFileId }: IfcFileIdParam
): Promise<FileFull> => {

    await assertIfcFileAccess(ifcFileId, user.user_id, "export");

    const ctxResult = await pool.query<ExportContext & { status: string }>(
        `SELECT f.project_id, p.name AS project_name, p.location AS project_location,
            s.name AS specialty_name, i.status, $2::INT AS uploaded_by
        FROM ifc_files i
        INNER JOIN files f ON f.file_id = i.ifc_file_id
        INNER JOIN projects p ON p.project_id = f.project_id
        INNER JOIN ifc_documents d ON d.ifc_document_id = i.ifc_document_id
        LEFT JOIN ifc_specialties s ON s.ifc_specialty_id = d.specialty_id
        WHERE i.ifc_file_id = $1`,
        [ifcFileId, user.user_id]
    );
    const ctx = ctxResult.rows[0];
    if (!ctx) throw new AppError(IFC_EXCEL_EXPORT_ERRORS.IFC_NOT_PROCESSED);
    if (ctx.status !== "done") throw new AppError(IFC_EXCEL_EXPORT_ERRORS.IFC_NOT_PROCESSED);

    const treeResult = await pool.query<PartidaTreeRow>(
        `SELECT p.partida_id, p.parent_id, p.code, p.description, p.unit, p.sort_order,
            COALESCE(t.element_count, 0) AS element_count, t.total
        FROM metrado_partidas p
        LEFT JOIN metrado_partida_totals t ON t.partida_id = p.partida_id
        WHERE p.ifc_file_id = $1
        ORDER BY p.sort_order`,
        [ifcFileId]
    );
    const arbol = buildPartidaTree(treeResult.rows);

    const elementsResult = await pool.query<PartidaElementRow & { partida_id: number; unit: string | null }>(
        `SELECT me.partida_id, mp.unit, e.element_id, e.express_id, e.name, e.level_name, e.space_name, e.tag,
            me.length, me.run_length, me.width, me.height, me.diameter, me.quantity, me.area, me.volume, me.weight
        FROM metrado_elements me
        JOIN ifc_elements e ON e.element_id = me.element_id
        JOIN metrado_partidas mp ON mp.partida_id = me.partida_id
        WHERE mp.ifc_file_id = $1
        ORDER BY mp.sort_order, e.level_name, e.space_name, e.tag, e.element_id`,
        [ifcFileId]
    );

    const rowsByPartida = new Map<number, { unit: string | null; rows: PartidaElementRow[] }>();
    for (const row of elementsResult.rows) {
        const bucket = rowsByPartida.get(row.partida_id) ?? { unit: row.unit, rows: [] };
        bucket.rows.push(row);
        rowsByPartida.set(row.partida_id, bucket);
    }

    // group_by = nivel+espacio+tag (el default de siempre) — se
    // preserva para que la agrupación siga siendo correcta (dos
    // elementos con el mismo tag en niveles distintos NO son el mismo
    // elemento repetido), aunque por ahora nivel/espacio no se
    // muestren como columna ni como fila de sub-encabezado en el Excel
    // (deferred, ver roadmap).
    const gruposPorPartida = new Map<number, PartidaElementGroup[]>();
    for (const [partidaId, { unit, rows }] of rowsByPartida) {
        gruposPorPartida.set(partidaId, groupPartidaElements(rows, ["level_name", "space_name", "tag"], unit));
    }

    const fecha = new Date();
    const wb = new ExcelJS.Workbook();
    escribirResumen(wb, ctx, fecha, arbol);
    escribirDetalle(wb, ctx, fecha, arbol, gruposPorPartida);

    const dir = path.join(UPLOADS_DIR, String(ctx.project_id));
    fsSync.mkdirSync(dir, { recursive: true });
    const safeName = `Metrados_${fecha.toISOString().slice(0, 10)}.xlsx`;
    const fileName = `${randomUUID()}-${safeName}`;
    const filePath = path.join(dir, fileName);
    await wb.xlsx.writeFile(filePath);

    try {
        const checksum = await computeChecksum(filePath);
        const stat = await fs.stat(filePath);

        const result = await pool.query<FileRow>(
            `INSERT INTO
                files(project_id, file_type, name, file_path, file_size, checksum, mime_type, uploaded_by, generated_from_ifc_file_id)
            VALUES
                ($1, 'excel', $2, $3, $4, $5, $6, $7, $8)
            RETURNING
                file_id, project_id, file_type, name, file_size, checksum, mime_type, uploaded_at, thumbnail_path,
                NULL AS ifc_status, NULL AS ifc_error_message,
                NULL AS ifc_document_id, NULL AS ifc_document_name, NULL AS version_number, NULL AS is_current,
                NULL AS specialty_code, NULL AS specialty_name,
                uploaded_by AS user_id,
                (SELECT name FROM users WHERE user_id = uploaded_by) AS user_name,
                (SELECT last_name FROM users WHERE user_id = uploaded_by) AS user_last_name,
                (SELECT email FROM users WHERE user_id = uploaded_by) AS user_email`,
            [
                ctx.project_id, safeName, filePath, stat.size, checksum,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                user.user_id, ifcFileId,
            ]
        );

        return transformFileToFull(result.rows[0]!);
    } catch (error) {
        await fs.rm(filePath, { force: true });
        throw error;
    }
};
