import type { ProductSummary } from "./product.models.js";
import type { HistorySort } from "./product-history.models.js";

// Un movimiento físico de stock en la ubicación (ingreso, vale o ajuste), de cualquier producto.
export interface LocationMovement {
    type: "entrada" | "salida";
    date: string;
    product: ProductSummary;
    bin: { bin_id: number; label: string };
    quantity: string;
    // Saldo TOTAL del producto justo después del movimiento (el snapshot del Kardex).
    balance_after: string;
    document: { type: "goods_receipt" | "goods_issue" | "inventory_adjustment"; id: number; label: string };
    // Solo ajustes: motivo y documento corregido.
    reason: string | null;
    adjusted_document: { type: "goods_receipt" | "goods_issue"; id: number; label: string } | null;
    // Solo ingresos: proveedor y tipo. Solo vales: destino y quien retira (sin DNI).
    supplier: { supplier_id: number; ruc: string; name: string } | null;
    entry_type: "normal" | "rapida" | null;
    destination: string | null;
    recipient_name: string | null;
}

export interface LocationHistory {
    location: {
        level: "rack" | "bin";
        warehouse: { warehouse_id: number; name: string };
        rack: { rack_id: number; name: string };
        bin: { bin_id: number; label: string; name: string } | null;
    };
    filters: { product_id: string | null; from: string | null; to: string | null; type: "all" | "entrada" | "salida"; sort: HistorySort; direction: "asc" | "desc" };
    // Lo que hay AHORA en la ubicación (sin cantidades en cero).
    contents: { product: ProductSummary; quantity: string }[];
    items: LocationMovement[];
    truncated: boolean;
}
