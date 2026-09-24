// Borrador de un documento a partir de su archivo (foto, escaneo o PDF), leído con IA. El usuario ya
// subió el archivo (POST /files); aquí se lee, se convierte en un borrador con la forma del cuerpo de
// crear el documento y se le agregan las ayudas: proveedor (por RUC), productos candidatos del catálogo,
// orden citada y avisos. NO guarda nada: el frontend arma el formulario, el usuario corrige y confirma
// con el POST normal de crear (con el mismo file_id).
import fs from "node:fs";
import path from "node:path";
import pool from "../../db/database.js";
import { AppError } from "../../models/errors/app-error.js";
import { DOCUMENT_FILE_ERRORS } from "../../models/errors/almacen/document-file.errors.js";
import { DOCUMENT_DRAFT_ERRORS } from "../../models/errors/almacen/document-draft.errors.js";
import type { DecodedToken } from "../../models/auth.models.js";
import { assertModulePermission } from "../project-access.service.js";
import { ALMACEN_MODULE_CODE } from "./warehouse.service.js";
import { getDocumentReader } from "../ai/document-reader.js";
import type { DraftDocumentType } from "../ai/document-read.prompt.js";
import type { DocumentRead } from "../ai/document-read.schema.js";
import type { CreateDocumentDraftBody } from "../../schemas/almacen/document-draft.schema.js";
import type { ProjectIdParam } from "../../schemas/projects.schema.js";
import type { DocumentDraft, DraftItemMatch, DraftWarning } from "../../models/almacen/document-draft.models.js";
import type { ProductSummary } from "../../models/almacen/product.models.js";
import {
    findSupplierByName, isValidRuc, lineAmountMatches, matchOrderLines, normalizeNumber, normalizeRuc, normalizeSeries, positive, rankProducts, sameOrderNumber, totalsMatch, validDate,
    type CatalogProduct, type OrderLine,
} from "./document-draft.mapping.js";

const SUPPORTED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const MAX_BYTES = 15 * 1024 * 1024;
const DETECTED_FOR: Record<DraftDocumentType, DocumentRead["detected_type"]> = {
    "invoice": "factura", "goods-receipt": "guia_remision", "quotation": "cotizacion", "purchase-order": "orden_compra", "requisition": "requerimiento",
};
const REQUIRED_TEXT: Record<DraftDocumentType, { field: string; label: string }[]> = {
    "invoice": [{ field: "series", label: "la serie" }, { field: "number", label: "el número" }, { field: "invoice_date", label: "la fecha" }, { field: "currency", label: "la moneda" }],
    "goods-receipt": [{ field: "delivery_note_series", label: "la serie de la guía" }, { field: "delivery_note_number", label: "el número de la guía" }, { field: "delivery_note_date", label: "la fecha de la guía" }],
    "quotation": [{ field: "number", label: "el número de la cotización" }, { field: "quotation_date", label: "la fecha" }, { field: "currency", label: "la moneda" }],
    "purchase-order": [{ field: "number", label: "el número de la orden" }, { field: "order_date", label: "la fecha" }, { field: "currency", label: "la moneda" }],
    "requisition": [{ field: "number", label: "el número del requerimiento" }, { field: "requisition_date", label: "la fecha" }, { field: "requester", label: "el solicitante" }],
};

const loadFile = async (projectId: number, fileId: number) => {
    const { rows } = await pool.query<{ file_path: string; mime_type: string | null; file_size: string | null }>(
        `SELECT f.file_path, f.mime_type, f.file_size FROM files f INNER JOIN modules m ON m.module_id = f.module_id
        WHERE f.file_id = $1 AND f.project_id = $2 AND m.code = $3`, [fileId, projectId, ALMACEN_MODULE_CODE]
    );
    const file = rows[0];
    if (!file) throw new AppError(DOCUMENT_FILE_ERRORS.FILE_NOT_FOUND);
    if (!file.mime_type || !SUPPORTED_MIME.has(file.mime_type)) throw new AppError(DOCUMENT_DRAFT_ERRORS.FILE_TYPE_NOT_SUPPORTED);
    if (Number(file.file_size) > MAX_BYTES) throw new AppError(DOCUMENT_DRAFT_ERRORS.FILE_TOO_LARGE);
    let bytes: Buffer;
    try { bytes = await fs.promises.readFile(path.resolve(file.file_path)); } catch { throw new AppError(DOCUMENT_DRAFT_ERRORS.FILE_UNREADABLE); }
    if (bytes.length > MAX_BYTES) throw new AppError(DOCUMENT_DRAFT_ERRORS.FILE_TOO_LARGE);
    return { bytes, mimeType: file.mime_type };
};

export const createDocumentDraftService = async (
    user: DecodedToken, { projectId }: ProjectIdParam, body: CreateDocumentDraftBody
): Promise<DocumentDraft> => {
    await assertModulePermission(projectId, user.user_id, ALMACEN_MODULE_CODE, "process");
    const { bytes, mimeType } = await loadFile(projectId, body.file_id);
    const type = body.document_type;

    const result = await getDocumentReader().read({ bytes, mimeType, documentType: type });
    // La sección (partida / material / equipo) solo existe en el papel de un requerimiento; en los demás la IA puede
    // "adivinarla" y eso no debe pesar en la coincidencia con el catálogo.
    const read: DocumentRead = type === "requisition" ? result.read : { ...result.read, items: result.read.items.map((item) => ({ ...item, category: null })) };
    const warnings: DraftWarning[] = [];
    const warn = (code: string, field: string | null, message: string) => warnings.push({ code, field, message });

    if (read.detected_type !== DETECTED_FOR[type]) {
        warn("DETECTED_TYPE_MISMATCH", null, read.detected_type === "otro"
            ? "El archivo no parece ser el documento indicado. Revisa que sea el correcto."
            : `El archivo parece ser otro tipo de documento (${read.detected_type.replace("_", " ")}). Revisa que sea el correcto.`);
    }

    // ---- proveedor -----------------------------------------------------------------------------
    const ruc = normalizeRuc(read.supplier?.ruc ?? null);
    const supplierName = read.supplier?.name?.trim() || null;
    let supplierMatch: DocumentDraft["supplier"]["match"] = null;
    let toCreate: DocumentDraft["supplier"]["to_create"] = null;
    if (type !== "requisition") {
        if (!isValidRuc(ruc)) {
            warn(ruc ? "RUC_INVALID" : "SUPPLIER_RUC_MISSING", "supplier_id", ruc ? `El RUC leído (${ruc}) no tiene 11 dígitos. Revísalo.` : "No se pudo leer el RUC del proveedor.");
            // Sin RUC utilizable, se intenta por el nombre: solo si hay un proveedor claramente igual.
            if (supplierName) {
                const all = await pool.query<{ supplier_id: number; ruc: string; name: string }>(`SELECT supplier_id, ruc, name FROM suppliers WHERE project_id = $1 AND deleted_at IS NULL`, [projectId]);
                supplierMatch = findSupplierByName(supplierName, all.rows);
                if (supplierMatch) warn("SUPPLIER_MATCHED_BY_NAME", "supplier_id", `Se encontró el proveedor ${supplierMatch.name} por su nombre (no se leyó el RUC): verifica que sea el mismo.`);
            }
        } else {
            const found = await pool.query<{ supplier_id: number; ruc: string; name: string }>(
                `SELECT supplier_id, ruc, name FROM suppliers WHERE project_id = $1 AND ruc = $2 AND deleted_at IS NULL`, [projectId, ruc]);
            supplierMatch = found.rows[0] ?? null;
            if (!supplierMatch && supplierName) {
                toCreate = { ruc, name: supplierName };
                warn("SUPPLIER_NOT_FOUND", "supplier_id", `El proveedor ${supplierName} (RUC ${ruc}) todavía no está registrado: puedes crearlo con estos datos.`);
            }
        }
    }

    // ---- catálogo y orden citada -----------------------------------------------------------------
    const products = await pool.query<CatalogProduct>(
        `SELECT p.product_id::text AS product_id, p.category_id, c.name AS category_name, p.code, p.display_id, p.name, p.unit
        FROM products p INNER JOIN categories c ON c.category_id = p.category_id WHERE p.project_id = $1 AND p.deleted_at IS NULL`, [projectId]);
    const catalog = products.rows;
    const summary = (p: CatalogProduct): ProductSummary => ({ product_id: p.product_id as unknown as number, category_id: p.category_id, code: p.code, display_id: p.display_id, name: p.name, unit: p.unit });

    let orderMatch: DocumentDraft["purchase_order"]["match"] = null;
    let orderLines: OrderLine[] = [];
    const referenced = normalizeNumber(read.referenced_order);
    if (referenced && (type === "invoice" || type === "goods-receipt")) {
        const orders = await pool.query<{ purchase_order_id: string; number: string; supplier_id: number }>(
            `SELECT purchase_order_id::text AS purchase_order_id, number, supplier_id FROM purchase_orders WHERE project_id = $1 AND deleted_at IS NULL`, [projectId]);
        const candidates = orders.rows.filter((o) => sameOrderNumber(o.number, referenced) && (!supplierMatch || o.supplier_id === supplierMatch.supplier_id));
        if (candidates.length === 1) {
            orderMatch = { purchase_order_id: candidates[0]!.purchase_order_id, number: candidates[0]!.number };
            const lines = await pool.query<OrderLine>(
                `SELECT purchase_order_item_id::text AS purchase_order_item_id, description, product_id::text AS product_id FROM purchase_order_items WHERE purchase_order_id = $1 ORDER BY purchase_order_item_id`,
                [orderMatch.purchase_order_id]);
            orderLines = lines.rows;
        } else {
            warn("ORDER_NOT_FOUND", "purchase_order_id", `El documento cita la orden ${referenced}, pero no se encontró una orden con ese número${supplierMatch ? " de este proveedor" : ""}.`);
        }
    }

    // ---- líneas ------------------------------------------------------------------------------------
    const orderMatches = orderLines.length ? matchOrderLines(read.items, orderLines) : read.items.map(() => null);
    const itemMatches: DraftItemMatch[] = read.items.map((item, index) => {
        const { candidates, suggested } = rankProducts(item, catalog);
        const link = orderMatches[index] ?? null;
        // Con orden, el producto es el de la línea de orden citada (regla de la cadena).
        const suggestedId = link ? link.line.product_id : suggested?.product_id ?? null;
        if (!link && !suggested) warn("LINE_PRODUCT_UNMATCHED", `items[${index}]`, candidates.length ? `La línea ${index + 1} podría ser varios productos: elige el correcto.` : `La línea ${index + 1} no coincide con ningún producto del catálogo: elige uno o crea uno nuevo.`);
        if (orderLines.length && !link) warn("LINE_ORDER_ITEM_UNMATCHED", `items[${index}]`, `La línea ${index + 1} no coincide con ninguna línea de la orden ${orderMatch?.number}: indícala a mano.`);
        return {
            index, read: { code: item.code, line_id: item.line_id, category: item.category, unit: item.unit },
            product_candidates: candidates.map((c) => ({ product_id: c.product.product_id, score: c.score, product: summary(c.product) })),
            suggested_product_id: suggestedId,
            order_item_candidate: link ? { purchase_order_item_id: link.line.purchase_order_item_id, description: link.line.description, score: link.score } : null,
        };
    });

    // ---- cuerpo del borrador según el tipo -------------------------------------------------------
    const date = validDate(read.date);
    if (read.date && !date) warn("DATE_INVALID", "date", `La fecha leída (${read.date}) no es válida.`);
    const series = normalizeSeries(read.series);
    const number = normalizeNumber(read.number);
    const lineItems = (qtyKey: string, withPrices: boolean) => read.items.map((item, i) => ({
        product_id: itemMatches[i]!.suggested_product_id,
        ...(orderLines.length || type === "invoice" || type === "goods-receipt" ? { purchase_order_item_id: itemMatches[i]!.order_item_candidate?.purchase_order_item_id ?? null } : {}),
        description: item.description, [qtyKey]: positive(item.quantity),
        ...(withPrices ? { unit_price: positive(item.unit_price), line_total: positive(item.line_total) } : {}),
    }));
    const draft: Record<string, unknown> = (() => {
        const common = { supplier_id: supplierMatch?.supplier_id ?? null, currency: read.currency };
        if (type === "invoice") return { ...common, purchase_order_id: orderMatch ? Number(orderMatch.purchase_order_id) : null, series, number, invoice_date: date, subtotal_amount: positive(read.subtotal), tax_amount: positive(read.tax), total_amount: positive(read.total), items: lineItems("quantity_invoiced", true) };
        if (type === "goods-receipt") return { supplier_id: common.supplier_id, entry_type: orderMatch ? "normal" : null, purchase_order_id: orderMatch ? Number(orderMatch.purchase_order_id) : null, delivery_note_series: series, delivery_note_number: number, delivery_note_date: date, items: lineItems("quantity_per_delivery_note", false) };
        if (type === "quotation") return { ...common, number, quotation_date: date, valid_until: validDate(read.valid_until), commercial_terms: read.commercial_terms, total_amount: positive(read.total), items: lineItems("quantity_quoted", true) };
        if (type === "purchase-order") return { ...common, number, order_date: date, commercial_terms: read.commercial_terms, total_amount: positive(read.total), items: lineItems("quantity_ordered", true) };
        return { number, requisition_date: date, requester: read.requester, notes: null, items: read.items.map((item, i) => ({ product_id: itemMatches[i]!.suggested_product_id, description: item.description, quantity_requested: positive(item.quantity), estimated_unit_price: positive(item.unit_price) })) };
    })();

    // ---- validaciones ------------------------------------------------------------------------------
    for (const { field, label } of REQUIRED_TEXT[type]) if (draft[field] == null || draft[field] === "") warn("MISSING_FIELD", field, `No se encontró ${label}: complétalo a mano.`);
    if (read.items.length === 0) warn("NO_ITEMS", "items", "No se pudo leer ninguna línea del documento.");
    if ((type === "invoice" || type === "goods-receipt") && series && !/^[A-Z0-9]{1,4}$/.test(series)) warn("FORMAT_INVALID", "series", "La serie debe tener de 1 a 4 letras o números.");
    if ((type === "invoice" || type === "goods-receipt") && number && !/^\d{1,8}$/.test(number)) warn("FORMAT_INVALID", "number", "El número debe tener de 1 a 8 dígitos.");
    // Cantidad × precio unitario debe dar el total de la línea: si no, lo más probable es una cantidad o un monto mal leído.
    read.items.forEach((item, i) => {
        if (lineAmountMatches(item) === false) warn("LINE_AMOUNT_MISMATCH", `items[${i}]`, `En la línea ${i + 1}, cantidad × precio unitario no da el total de la línea. Revisa la cantidad y los montos.`);
    });
    if (totalsMatch(read.items, read) === false) warn("TOTAL_MISMATCH", "total_amount", "La suma de las líneas no coincide con el total leído. Revisa cantidades y montos.");
    if (date && date > new Date().toLocaleDateString("en-CA")) warn("DATE_IN_FUTURE", "date", "La fecha leída es posterior a hoy.");

    // Documento repetido: se avisa antes de que el usuario llene el resto.
    const dup = await findDuplicate(projectId, type, supplierMatch?.supplier_id ?? null, series, number);
    if (dup) warn("DUPLICATE_DOCUMENT", "number", "Ya existe un documento registrado con ese número: no se podrá crear otro igual.");

    return {
        document_type: type, file_id: String(body.file_id), engine: result.engine, detected_type: read.detected_type,
        draft, supplier: { match: supplierMatch, to_create: toCreate }, purchase_order: { match: orderMatch, referenced },
        items: itemMatches, warnings, read_notes: read.warnings,
    };
};

const findDuplicate = async (projectId: number, type: DraftDocumentType, supplierId: number | null, series: string | null, number: string | null): Promise<boolean> => {
    if (!number) return false;
    const q = async (sql: string, params: unknown[]) => ((await pool.query(sql, params)).rowCount ?? 0) > 0;
    if (type === "requisition") return q(`SELECT 1 FROM purchase_requisitions WHERE project_id = $1 AND number = $2 AND deleted_at IS NULL`, [projectId, number]);
    if (type === "purchase-order") return q(`SELECT 1 FROM purchase_orders WHERE project_id = $1 AND number = $2 AND deleted_at IS NULL`, [projectId, number]);
    if (supplierId === null) return false;
    if (type === "quotation") return q(`SELECT 1 FROM quotations WHERE project_id = $1 AND supplier_id = $2 AND number = $3 AND deleted_at IS NULL`, [projectId, supplierId, number]);
    if (!series) return false;
    if (type === "invoice") return q(`SELECT 1 FROM invoices WHERE project_id = $1 AND supplier_id = $2 AND series = $3 AND number = $4 AND deleted_at IS NULL`, [projectId, supplierId, series, number]);
    return q(`SELECT 1 FROM goods_receipts WHERE project_id = $1 AND supplier_id = $2 AND delivery_note_series = $3 AND delivery_note_number = $4 AND voided_at IS NULL`, [projectId, supplierId, series, number]);
};
