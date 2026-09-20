import type { ProductSummary } from "./product.models.js";
// inventory_adjustments (Ajustes de inventario) — Fase 10 de
// docs/almacen-ingreso-productos/05-roadmap.md. Corrigen las cantidades de un ingreso o
// de un vale YA registrados SIN reescribirlos: el original queda igual y el ajuste es un
// documento nuevo, con motivo, que genera movimientos de stock normales. Las cantidades
// son NUMERIC: llegan como string (nunca se suman con `+` en JS).
export type AdjustmentKind = "correccion" | "anulacion";
export type AdjustedDocumentType = "goods_receipt" | "goods_issue";

export interface InventoryAdjustmentItem {
    inventory_adjustment_item_id: number;
    // Línea corregida: goods_receipt_item_id (ingreso) o goods_issue_item_id (vale).
    item_id: number;
    product: ProductSummary;
    bin: { bin_id: number; label: string };
    // Cambio de la cantidad DEL DOCUMENTO en esa casilla (+ más recibido / más retirado).
    quantity_delta: string;
    // Efecto real en el stock de esa casilla (+ sube, - baja): en un vale es el opuesto.
    stock_effect: string;
}

export interface InventoryAdjustment {
    inventory_adjustment_id: number;
    project_id: number;
    kind: AdjustmentKind;
    // Documento corregido ("T001-5" para un ingreso, "VS-01" para un vale (su número)).
    reference_document: { type: AdjustedDocumentType; id: number; label: string };
    reason: string;
    // Fecha de la corrección "AAAA-MM-DD" (la de sus movimientos de Kardex).
    adjustment_date: string;
    created_at: Date;
    created_by: number;
    items: InventoryAdjustmentItem[];
}

// Lo que se agrega al detalle de cada LÍNEA de un ingreso o un vale.
export interface ItemAdjustmentSummary {
    // Suma de los ajustes de la línea y cantidad efectiva (registrada + ajustes).
    adjusted_quantity: string;
    effective_quantity: string;
    // Dónde queda efectivamente lo de esta línea (lo registrado + ajustes, sin casillas en cero).
    effective_locations: { bin_id: number; label: string; quantity: string }[];
    adjustments: {
        inventory_adjustment_id: number; kind: AdjustmentKind; reason: string; adjustment_date: string;
        bin_id: number; quantity_delta: string;
    }[];
}
