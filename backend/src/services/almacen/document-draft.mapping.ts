// Piezas puras (sin base de datos ni red) para convertir lo que la IA leyó en un borrador:
// normalización de texto y de campos, y puntaje de coincidencia contra el catálogo y las órdenes.
// Se prueban aparte de la IA y de la base.
import type { DocumentRead } from "../ai/document-read.schema.js";

const STOP_WORDS = new Set(["de", "con", "para", "x", "el", "la", "los", "las", "y", "en", "un", "una", "del", "al", "por", "tipo"]);

export const normalizeText = (s: string): string =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const tokens = (s: string): string[] => normalizeText(s).split(" ").filter((t) => t && !STOP_WORDS.has(t) && (t.length >= 2 || /\d/.test(t)));

// 0..1: parecido entre dos textos (palabras compartidas; una descripción corta contenida en otra larga puntúa alto).
export const similarity = (a: string, b: string): number => {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (A.size === 0 || B.size === 0) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    return Math.max(inter / (A.size + B.size - inter), (inter / Math.min(A.size, B.size)) * 0.85);
};

export const normalizeCode = (c: string): string => c.toUpperCase().replace(/[^A-Z0-9.]/g, "");

const UNIT_ALIASES: Record<string, string> = { un: "und", unid: "und", unidad: "und", unidades: "und", und: "und", "m³": "m3", "m²": "m2", kgs: "kg", millares: "millar", mll: "millar" };
export const normalizeUnit = (u: string | null): string | null => {
    if (!u) return null;
    const x = u.toLowerCase().replace(/[.\s]/g, "");
    return UNIT_ALIASES[x] ?? x;
};

export const normalizeRuc = (r: string | null): string | null => (r ? r.replace(/\D/g, "") || null : null);
export const isValidRuc = (r: string | null): r is string => r !== null && /^\d{11}$/.test(r);
export const normalizeSeries = (s: string | null): string | null => (s ? s.toUpperCase().replace(/[^A-Z0-9]/g, "") || null : null);
export const normalizeNumber = (n: string | null): string | null => (n ? n.trim() || null : null);

// Fecha AAAA-MM-DD real del calendario, o null.
export const validDate = (d: string | null): string | null => {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const date = new Date(`${d}T00:00:00Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== d ? null : d;
};

export const positive = (n: number | null): number | null => (n !== null && Number.isFinite(n) && n >= 0 ? n : null);

// ---- coincidencia con el catálogo -------------------------------------------------------------
export interface CatalogProduct { product_id: string; category_id: number; category_name: string; code: string; display_id: number; name: string; unit: string }
type ReadItem = DocumentRead["items"][number];

const CATEGORY_BY_READ: Record<string, string> = { partida: "partida", material: "materiales", equipo: "equipo" };

export const scoreProduct = (item: ReadItem, product: CatalogProduct): number => {
    const text = similarity(item.description, product.name);
    let score = text;
    if (item.code && normalizeCode(item.code) === normalizeCode(product.code)) score = Math.max(score, 0.5 + 0.5 * text);
    const category = item.category ? CATEGORY_BY_READ[item.category] : null;
    const categoryOk = !category || normalizeText(product.category_name) === category;
    // El ID impreso solo ayuda si la descripción se parece un poco: el mismo número existe en catálogos ajenos.
    if (item.line_id && category && categoryOk && Number(item.line_id) === product.display_id && text >= 0.2) score = Math.max(score, 0.6 + 0.4 * text);
    if (normalizeUnit(item.unit) && normalizeUnit(item.unit) === normalizeUnit(product.unit)) score = Math.min(1, score + 0.05);
    if (!categoryOk) score *= 0.6;
    return Math.round(score * 100) / 100;
};

export const rankProducts = (item: ReadItem, catalog: CatalogProduct[]): { candidates: { product: CatalogProduct; score: number }[]; suggested: CatalogProduct | null } => {
    const ranked = catalog.map((product) => ({ product, score: scoreProduct(item, product) })).filter((c) => c.score >= 0.35).sort((a, b) => b.score - a.score).slice(0, 3);
    const [top, second] = ranked;
    const suggested = top && top.score >= 0.6 && (!second || top.score - second.score >= 0.1) ? top.product : null;
    return { candidates: ranked, suggested };
};

// ---- coincidencia de un proveedor por su nombre (cuando el RUC no se leyó) ---------------------
const LEGAL_SUFFIXES = new Set(["sac", "saa", "sa", "srl", "eirl", "ltda", "ltd", "sucursal", "peru", "del", "de"]);
const companyTokens = (name: string): string[] => normalizeText(name).split(" ").filter((t) => t.length >= 2 && !LEGAL_SUFFIXES.has(t));

// El proveedor del proyecto cuyo nombre coincide claramente con el leído (sin razón social ni sufijos legales); null si no hay uno claro.
export const findSupplierByName = <T extends { name: string }>(read: string, suppliers: T[]): T | null => {
    const A = new Set(companyTokens(read));
    if (A.size === 0) return null;
    const scored = suppliers.map((s) => {
        const B = new Set(companyTokens(s.name));
        let inter = 0;
        for (const t of A) if (B.has(t)) inter++;
        return { s, score: B.size === 0 ? 0 : inter / (A.size + B.size - inter) };
    }).filter((x) => x.score >= 0.8).sort((a, b) => b.score - a.score);
    return scored.length === 1 || (scored.length > 1 && scored[0]!.score - scored[1]!.score >= 0.2) ? scored[0]!.s : null;
};

// ---- coincidencia con las líneas de una orden -------------------------------------------------
export interface OrderLine { purchase_order_item_id: string; description: string; product_id: string }

// Asigna a cada línea leída la línea de orden más parecida, sin repetir una misma línea de orden.
export const matchOrderLines = (items: ReadItem[], lines: OrderLine[]): ({ line: OrderLine; score: number } | null)[] => {
    const used = new Set<string>();
    return items.map((item) => {
        let best: { line: OrderLine; score: number } | null = null;
        for (const line of lines) {
            if (used.has(line.purchase_order_item_id)) continue;
            const score = similarity(item.description, line.description);
            if (score >= 0.5 && (!best || score > best.score)) best = { line, score: Math.round(score * 100) / 100 };
        }
        if (best) used.add(best.line.purchase_order_item_id);
        return best;
    });
};

// ¿cantidad × precio unitario = total de la línea (tolerancia 1 %)? null = falta algún dato.
export const lineAmountMatches = (item: Pick<ReadItem, "quantity" | "unit_price" | "line_total">): boolean | null => {
    if (item.quantity === null || item.unit_price === null || item.line_total === null) return null;
    const expected = item.quantity * item.unit_price;
    return Math.abs(expected - item.line_total) <= Math.max(0.05, Math.abs(item.line_total) * 0.01);
};

// ¿La suma de las líneas coincide con el total (o subtotal) leído? null = no se puede comparar.
export const totalsMatch = (items: ReadItem[], read: Pick<DocumentRead, "subtotal" | "total">): boolean | null => {
    const totals = items.map((i) => i.line_total);
    if (totals.length === 0 || totals.some((t) => t === null)) return null;
    const sum = totals.reduce<number>((s, t) => s + (t ?? 0), 0);
    const reference = [read.subtotal, read.total].filter((x): x is number => x !== null);
    if (reference.length === 0) return null;
    return reference.some((ref) => Math.abs(ref - sum) <= Math.max(0.05, ref * 0.005));
};

// Número de orden citado en un documento vs número de una orden del proyecto: se ignoran mayúsculas y símbolos.
export const sameOrderNumber = (a: string, b: string): boolean => a.toUpperCase().replace(/[^A-Z0-9]/g, "") === b.toUpperCase().replace(/[^A-Z0-9]/g, "");
