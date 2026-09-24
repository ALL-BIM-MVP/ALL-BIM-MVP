import type { ProductSummary } from "./product.models.js";
import type { DraftDocumentType } from "../../services/ai/document-read.prompt.js";

// Borrador de un documento leído con IA (POST /document-drafts). No es un documento: no se guarda nada.
// `draft` tiene la forma del cuerpo de crear ese documento, con null donde el papel no lo trae; el
// frontend lo muestra como formulario ya lleno, el usuario lo corrige y confirma con el POST normal.
export interface DraftWarning {
    code: string;
    field: string | null;
    message: string;
}

export interface DraftProductCandidate {
    product_id: string;
    score: number;
    product: ProductSummary;
}

export interface DraftItemMatch {
    // Posición de la línea dentro de draft.items.
    index: number;
    // Lo que se leyó de la línea (código, ID e identificación de sección tal como están en el papel).
    read: { code: string | null; line_id: string | null; category: string | null; unit: string | null };
    product_candidates: DraftProductCandidate[];
    // Producto sugerido (coincidencia clara); null = que el usuario elija o cree uno nuevo.
    suggested_product_id: string | null;
    // Línea de la orden citada que parece corresponder (facturas e ingresos con orden).
    order_item_candidate: { purchase_order_item_id: string; description: string; score: number } | null;
}

export interface DocumentDraft {
    document_type: DraftDocumentType;
    file_id: string;
    engine: { provider: string; model: string };
    // Lo que la IA cree que es el documento (puede no coincidir con el tipo pedido).
    detected_type: string;
    draft: Record<string, unknown>;
    supplier: {
        match: { supplier_id: number; ruc: string; name: string } | null;
        // No existe todavía: datos leídos para ofrecer "crear proveedor" ya rellenado.
        to_create: { ruc: string; name: string } | null;
    };
    purchase_order: { match: { purchase_order_id: string; number: string } | null; referenced: string | null };
    items: DraftItemMatch[];
    warnings: DraftWarning[];
    // Dudas de lectura anotadas por la IA (borroso, manuscrito, tapado…).
    read_notes: string[];
}
