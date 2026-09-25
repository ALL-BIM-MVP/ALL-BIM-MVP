// Tipos del módulo Almacén BIM — reflejan los shapes reales documentados
// en la guía de integración (warehouse > rack > bin), no inventados.

export type WarehouseDirection = 'norte' | 'sur' | 'este' | 'oeste';

export interface WarehouseStyle {
  warehouse_style_id: number;
  name: string;
  roof_color: string;
  wall_color: string;
  wall_frame_color: string;
  max_level: number;
}

export interface Warehouse {
  warehouse_id: number;
  project_id: number;
  name: string;
  warehouse_style_id: number;
  direction: WarehouseDirection;
  grid_width: number;
  grid_depth: number;
  corner1_x: number;
  corner1_z: number;
  corner2_x: number;
  corner2_z: number;
  area_m2: number;
  created_at: string;
}

export interface WarehouseInput {
  name: string;
  warehouse_style_id: number;
  direction: WarehouseDirection;
  grid_width: number;
  grid_depth: number;
  corner1_x: number;
  corner1_z: number;
  corner2_x: number;
  corner2_z: number;
}

export interface BinContent {
  product_id: number;
  code: string;
  name: string;
  quantity: number;
  model_3d_url: string | null;
  model_3d_format: 'glb' | 'gltf' | null;
}

export interface Bin {
  bin_id: number;
  rack_id: number;
  bay: number;
  level: number;
  face: 0 | 1;
  location_label: string;
  name: string;
  contents: BinContent[];
}

export interface Rack {
  rack_id: number;
  warehouse_id: number;
  name: string;
  corner1_x: number;
  corner1_z: number;
  corner2_x: number;
  corner2_z: number;
  levels: number;
  direction: 0 | 1;
  width: number; // bahías, derivado de las esquinas
  depth: 1 | 2; // derivado de las esquinas, nunca más de 2
  bins?: Bin[]; // solo viene en el detalle, no en el listado
}

export interface RackInput {
  name: string;
  levels: number;
  direction: 0 | 1;
  corner1_x: number;
  corner1_z: number;
  corner2_x: number;
  corner2_z: number;
}

// Exactamente 3 filas por proyecto, fijas — de solo lectura, no hay
// endpoint para crear/editar/borrar categorías.
export interface Category {
  category_id: number;
  project_id: number;
  name: string;
  type: 'fijo' | 'relacional';
  prefix: string | null;
  base_category_id: number | null;
}

export type Model3DFormat = 'glb' | 'gltf';

// model_3d_asset_id es la ÚNICA columna real de "qué modelo tiene" un producto — NULL = sin
// modelo. Un producto siempre nace sin modelo (no se crea acá): se asigna después, referenciando un
// Model3DAsset ya existente (mío, del sistema, o ya en uso en este proyecto) o uno recién subido.
export interface Product {
  product_id: number;
  project_id: number;
  category_id: number;
  code: string;
  is_fixed: boolean;
  base_product_code: string | null;
  tag: number;
  name: string;
  unit: string;
  model_3d_asset_id: number | null;
  model_3d_name: string | null;
  model_3d_format: Model3DFormat | null;
  // Relativa a un proyecto puntual (Bearer normal, no firmada) — null si no hay modelo asignado.
  model_3d_url: string | null;
  total_stock: number;
  main_location: string | null;
  // Solo viene en el detalle (GET .../products/:id), y solo tiene datos
  // reales cuando este producto es de categoría 'fijo' (una Partida) —
  // sus Materiales/Equipos relacionados. [] en cualquier otro caso.
  related?: Pick<Product, 'product_id' | 'code' | 'name'>[];
}

// code y base_product_code son excluyentes — cuál hace falta lo decide
// categories.type (fijo → code, relacional → base_product_code), el
// backend arma el code final solo (ej. "MAT-01.02.03"). El modelo 3D NO
// se crea acá — se asigna después con assignProductModel3D.
export interface ProductCreateInput {
  category_id: number;
  code?: string;
  base_product_code?: string;
  name: string;
  unit: string;
}

// A propósito sin category_id/code/base_product_code (identidad, fijada al crearlo) ni nada de
// modelo 3D (tiene sus propios endpoints, ver assignProductModel3D en product.service.ts).
export interface ProductUpdateInput {
  name: string;
  unit: string;
}

// Biblioteca personal de modelos 3D — del usuario que lo subió, no de ningún proyecto. Un producto
// solo puede asignar uno que ya exista acá (assignProductModel3D), nunca un texto libre.
export interface Model3DAsset {
  model_3d_asset_id: number;
  name: string;
  format: Model3DFormat;
  owner_id: number;
  is_system: boolean;
  created_at: string;
  url: string; // relativo a un proyecto puntual, mismo criterio que Product.model_3d_url
}

// goods_receipts (Ingreso) — movimiento inmutable: sin DELETE, un error de cantidades/casillas se
// corrige con un ajuste (Fase 10), nunca reescribiendo este. Contrato nuevo (Fase 7): "rapida" (sin
// documentos previos) o "normal" (puede citar una Orden de Compra, incluso después de creado).
export type GoodsReceiptEntryType = 'rapida' | 'normal';

export interface GoodsReceiptItemLocationInput {
  bin_id: number;
  quantity: number;
}

// Con orden (entry_type "normal" + purchase_order_id): la línea SIEMPRE cita
// purchase_order_item_id, nunca lleva product_id. Sin orden ("rapida", o "normal" todavía sin
// vincular): nunca cita nada, siempre lleva product_id.
export interface GoodsReceiptItemInput {
  purchase_order_item_id?: number | null;
  // A diferencia de purchase_order_item_id, el backend NO acepta `null` acá — o se manda el
  // número, o se omite el campo (undefined). Mandar `null` da 400 (idSchema no es nullable).
  product_id?: number;
  total_quantity: number;
  // Lo que decía la guía (puede diferir de lo recibido de verdad) — opcional, tampoco nullable.
  quantity_per_delivery_note?: number;
  // La suma tiene que dar EXACTO total_quantity — lo valida el backend, y también el form antes de mandarlo.
  locations: GoodsReceiptItemLocationInput[];
}

export interface GoodsReceiptCreateInput {
  supplier_id: number;
  entry_type: GoodsReceiptEntryType;
  // Solo con "normal" — "rapida" no puede citar ninguna (400 si se envía).
  purchase_order_id?: number | null;
  delivery_note_series: string;
  delivery_note_number: string;
  delivery_note_date: string; // AAAA-MM-DD
  received_date?: string; // opcional, default hoy
  items: GoodsReceiptItemInput[];
}

// PATCH — corrige SOLO datos administrativos de la guía, nunca cantidades/productos/casillas.
export interface GoodsReceiptPatchInput {
  delivery_note_series?: string;
  delivery_note_number?: string;
  delivery_note_date?: string;
}

// PUT /:id/purchase-order — vincula o reemplaza la orden de un ingreso ya registrado. Hay que
// indicar la línea de orden de TODAS las líneas del ingreso, sin repetir ni omitir ninguna.
export interface GoodsReceiptLinkOrderInput {
  purchase_order_id: number;
  items: Array<{ goods_receipt_item_id: string; purchase_order_item_id: string }>;
}

export interface GoodsReceiptItemLocation {
  goods_receipt_item_location_id: string;
  goods_receipt_item_id: string;
  bin_id: string;
  quantity: string;
}

export interface GoodsReceiptItem {
  goods_receipt_item_id: string;
  goods_receipt_id: string;
  purchase_order_item_id: string | null;
  product: EmbeddedProduct | null;
  purchase_order_item: { purchase_order_item_id: string; description: string; quantity_ordered: string } | null;
  // LO REGISTRADO — nunca cambia, ni con ajustes. locations es el reparto registrado (ídem).
  total_quantity: string;
  quantity_per_delivery_note: string | null;
  locations: GoodsReceiptItemLocation[];
  // Fase 10: lo que de verdad hay hoy (registrado + ajustes) — usar esto para mostrar el estado real.
  adjusted_quantity: string;
  effective_quantity: string;
  effective_locations: EffectiveLocation[]; // sin casillas en cero
  adjustments: AppliedAdjustment[];
  // Avance ACUMULADO de la línea de orden que recibe esta línea — null si el ingreso no tiene orden.
  purchase_order_progress: PurchaseOrderItemProgress | null;
  alerts: DocumentAlert[];
}

// Checklist del expediente del ingreso — "no_aplica" para lo que ese tipo de entrada nunca tiene
// (ej. entrada rápida: todo "no_aplica" salvo el escaneo), "pendiente" es "falta registrar", no "no hay".
export interface GoodsReceiptDocumentsChecklist {
  requisition: DocumentPresence;
  quotation: DocumentPresence;
  purchase_order: DocumentPresence;
  invoice: DocumentPresence;
  delivery_note_file: DocumentPresence;
}

export interface GoodsReceiptListItem {
  goods_receipt_id: string;
  project_id: number;
  supplier: QuotationSupplierRef;
  entry_type: GoodsReceiptEntryType;
  // null = "normal" todavía sin vincular a ninguna orden, o "rapida" (nunca tiene).
  purchase_order: InvoicePurchaseOrderRef | null;
  delivery_note_series: string;
  delivery_note_number: string;
  delivery_note_date: string;
  received_date: string;
  has_file: boolean;
  created_at: string;
  updated_at: string | null;
  updated_by: number | null;
  documents: GoodsReceiptDocumentsChecklist;
  alerts: DocumentAlert[];
  voided: boolean;
  voided_at: string | null;
}

export interface GoodsReceipt extends GoodsReceiptListItem {
  items?: GoodsReceiptItem[]; // solo en el detalle, no en el listado
  file?: DocumentFile | null;
}

// goods_issues (Vale de Salida) — simétrico a goods_receipts (resta en
// vez de sumar), también un movimiento inmutable.
export interface GoodsIssueItemLocationInput {
  bin_id: number;
  quantity: number;
}

export interface GoodsIssueItemInput {
  product_id: number;
  total_quantity: number;
  locations: GoodsIssueItemLocationInput[];
}

export interface GoodsIssueInput {
  destination_sector: string;
  destination_level: string;
  destination_block: string;
  recipient_name: string;
  recipient_dni: string;
  issue_date: string; // ISO (yyyy-mm-dd)
  items: GoodsIssueItemInput[];
}

export interface GoodsIssueItemLocation {
  goods_issue_item_location_id: number;
  goods_issue_item_id: number;
  bin_id: number;
  quantity: number;
}

export interface GoodsIssueItem {
  goods_issue_item_id: number;
  goods_issue_id: number;
  product_id: number;
  total_quantity: number;
  locations: GoodsIssueItemLocation[];
  // Fase 10 — Vales nunca tuvo un aviso propio de migración de IDs/cantidades a texto (a
  // diferencia de Ingresos en Fase 7), así que estos campos quedan opcionales hasta confirmar su
  // shape real: si el backend ya los devuelve como texto (como el resto de esta fase), igual
  // funcionan acá (JS no exige el tipo exacto en tiempo de ejecución).
  adjusted_quantity?: string;
  effective_quantity?: string;
  effective_locations?: EffectiveLocation[];
  adjustments?: AppliedAdjustment[];
}

export interface GoodsIssue {
  goods_issue_id: number;
  project_id: number;
  destination_sector: string;
  destination_level: string;
  destination_block: string;
  recipient_name: string;
  recipient_dni: string;
  issue_date: string;
  created_at: string;
  items?: GoodsIssueItem[]; // solo en el detalle, no en el listado
  voided?: boolean;
  voided_at?: string | null;
}

// inventory_movements (Kardex) — historial inmutable. resulting_balance
// es una foto del saldo justo en ese momento, nunca se recalcula al leer.
export interface InventoryMovement {
  inventory_movement_id: number;
  product_id: number;
  type: 'entrada' | 'salida';
  quantity: number;
  bin_id: number;
  resulting_balance: number;
  reference_document_type: 'goods_receipt' | 'goods_issue';
  reference_document_id: number;
  // Fecha del DOCUMENTO (received_date del ingreso / issue_date del vale) — es la que se usa
  // para filtrar y ordenar. created_at (cuándo se registró) queda solo informativo.
  movement_date: string; // AAAA-MM-DD
  created_at: string;
}

// from/to: SOLO "AAAA-MM-DD" (inclusive por día), comparados contra movement_date — no created_at.
// Cualquier otro formato (ej. con hora) el backend lo rechaza con 400.
export interface InventoryMovementFilters {
  product_id?: number;
  from?: string;
  to?: string;
}

// GET .../locations/search — resultado unificado sea cual sea el tipo
// que matcheó. `path` ya viene armado por el backend (warehouse > rack
// > bin), no hace falta resolverlo con JOINs propios acá.
export interface LocationSearchResult {
  type: 'warehouse' | 'rack' | 'bin';
  warehouse_id: number;
  rack_id: number | null;
  bin_id: number | null;
  name: string;
  path: string;
}

// ---------------------------------------------------------------------
// Documentos de abastecimiento (Requerimiento → Cotización → OC → Factura
// → Guía/Ingreso). Contrato nuevo (fases 3+): los BIGINT viajan como
// TEXTO (comparar siempre con String(a) === String(b), nunca ===
// numérico), y las cantidades/montos también como texto con 6 decimales
// en las respuestas — pero se ENVÍAN como número al crear/editar. Solo
// son numéricos de verdad: category_id, display_id, project_id y los ya
// existentes arriba (warehouse_id, etc.).
// ---------------------------------------------------------------------

// Proveedores — pertenecen al proyecto, sin catálogo global. El RUC no
// se puede cambiar una vez creado, y no se da de baja si ya tiene
// documentos (cotizaciones, órdenes, facturas) — documents_count es ese conteo.
export interface Supplier {
  supplier_id: number;
  project_id: number;
  ruc: string; // 11 dígitos
  name: string;
  documents_count: number;
  created_at: string;
}

export interface SupplierCreateInput {
  ruc: string;
  name: string;
}

// Único campo editable — el RUC es la identidad del proveedor.
export interface SupplierUpdateInput {
  name: string;
}

// Mismo producto embebido en cualquier documento que lo muestre
// (requerimientos, cotizaciones, órdenes, facturas, ingresos, vales,
// ajustes, Kardex, trazabilidad, hoja de vida).
export interface EmbeddedProduct {
  product_id: string;
  category_id: number;
  code: string;
  display_id: number;
  name: string;
  unit: string;
}

export interface DocumentFile {
  file_id: string;
  name: string;
  mime_type: string;
  file_size: string;
  url: string;
}

// Estado documental (Fase 8) — todo se CALCULA al consultar, nunca se guarda ni se desactualiza.
// Los avisos son informativos: nunca bloquean ninguna operación. Solo cuentan documentos activos.
export type AlertCode =
  | 'OVER_RECEIVED' | 'OVER_INVOICED' | 'ORDERED_OVER_QUOTED' | 'ORDERED_OVER_REQUESTED'
  | 'RECEIVED_OVER_REQUESTED' | 'RECEIVED_NOT_INVOICED' | 'INVOICED_NOT_RECEIVED'
  | 'FILE_PENDING' | 'ORDER_PENDING' | 'INVOICE_PENDING';

export interface DocumentAlert {
  code: AlertCode;
  message: string;
  details?: Record<string, string>;
}

export type DocumentPresence = 'presente' | 'pendiente' | 'no_aplica';

export interface PurchaseRequisitionItemProgress {
  requested: string;
  offers_count: number;
  ordered: string;
  invoiced: string;
  received: string;
  pending_to_order: string;
  pending_to_receive: string;
  missing: Array<'quotation' | 'order' | 'invoice' | 'receipt'>;
}

export interface PurchaseRequisitionSummary {
  lines: number;
  quoted: number;
  ordered: number;
  invoiced: number;
  received: number;
  fully_received: number;
}

export interface QuotationItemProgress {
  quoted: string;
  ordered: string;
  orders_count: number;
  awarded: boolean; // deducido: alguna orden activa cita la línea — no hay estado propio que marcar
  pending_to_order: string;
}

export interface PurchaseOrderItemProgress {
  ordered: string;
  invoiced: string;
  received: string;
  pending_to_invoice: string;
  pending_to_receive: string;
  quoted: string | null;
  requested: string | null;
}

export interface PurchaseRequisitionListItem {
  purchase_requisition_id: string;
  project_id: number;
  number: string;
  requisition_date: string; // AAAA-MM-DD
  requester: string;
  notes: string | null;
  items_count: number;
  has_file: boolean;
  created_at: string;
}

export interface PurchaseRequisitionItem {
  purchase_requisition_item_id: string;
  // null cuando el producto citado ya no existe/fue dado de baja — la línea sigue mostrando su snapshot.
  product: EmbeddedProduct | null;
  description: string;
  quantity_requested: string;
  estimated_unit_price: string | null;
  progress: PurchaseRequisitionItemProgress;
  alerts: DocumentAlert[];
}

export interface PurchaseRequisitionDetail extends PurchaseRequisitionListItem {
  items: PurchaseRequisitionItem[];
  file: DocumentFile | null;
  summary: PurchaseRequisitionSummary;
  alerts: DocumentAlert[];
}

export interface PurchaseRequisitionItemInput {
  product_id: number;
  description: string;
  quantity_requested: number;
  estimated_unit_price?: number | null;
}

// Cabecera parcial — el backend exige al menos un campo.
export interface PurchaseRequisitionUpdateInput {
  number?: string;
  requisition_date?: string;
  requester?: string;
  notes?: string | null;
}

export interface PurchaseRequisitionCreateInput extends PurchaseRequisitionUpdateInput {
  number: string;
  requisition_date: string;
  requester: string;
  items: PurchaseRequisitionItemInput[];
}

// product_id no admite null acá — para sacar la línea está DELETE /items/:itemId.
export interface PurchaseRequisitionItemUpdateInput {
  product_id?: number;
  description?: string;
  quantity_requested?: number;
  estimated_unit_price?: number | null;
}

export type Currency = 'PEN' | 'USD';

// Referencias resumidas — mismo criterio que EmbeddedProduct: cada documento que lo muestre
// trae el mismo shape chico, no hace falta ir a buscar el proveedor/requerimiento aparte.
export interface QuotationSupplierRef {
  supplier_id: number;
  ruc: string;
  name: string;
}

export interface QuotationRequisitionRef {
  purchase_requisition_id: string;
  number: string;
}

export interface QuotationListItem {
  quotation_id: string;
  project_id: number;
  supplier: QuotationSupplierRef;
  purchase_requisition: QuotationRequisitionRef;
  number: string;
  quotation_date: string;
  currency: Currency;
  commercial_terms: string | null;
  valid_until: string | null;
  items_count: number;
  has_file: boolean;
  total_amount: string | null;
  lines_total: string; // suma real de las líneas — comparar contra total_amount y avisar si difieren
  created_at: string;
}

export interface QuotationItem {
  quotation_item_id: string;
  purchase_requisition_item_id: string;
  // null cuando el producto de esa línea ya no existe/fue dado de baja.
  product: EmbeddedProduct | null;
  requisition_item: { description: string; quantity_requested: string } | null;
  description: string;
  quantity_quoted: string;
  unit_price: string | null;
  discount_amount: string | null;
  tax_amount: string | null;
  line_total: string;
  notes: string | null;
  progress: QuotationItemProgress;
  alerts: DocumentAlert[];
}

export interface QuotationDetail extends QuotationListItem {
  items: QuotationItem[];
  file: DocumentFile | null;
  alerts: DocumentAlert[];
}

export interface QuotationItemInput {
  purchase_requisition_item_id: string;
  description: string;
  quantity_quoted: number;
  unit_price?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  line_total: number;
  notes?: string | null;
}

export interface QuotationCreateInput {
  supplier_id: number;
  purchase_requisition_id: string;
  number: string;
  quotation_date: string;
  currency: Currency;
  commercial_terms?: string | null;
  valid_until?: string | null;
  total_amount?: number | null;
  items: QuotationItemInput[];
}

// Cabecera parcial — proveedor y requerimiento NO se cambian (identidad fijada al crear).
export interface QuotationUpdateInput {
  number?: string;
  quotation_date?: string;
  currency?: Currency;
  commercial_terms?: string | null;
  valid_until?: string | null;
  total_amount?: number | null;
}

// No cambia la línea del requerimiento citada ni el producto — solo los datos propios de la oferta.
export interface QuotationItemUpdateInput {
  description?: string;
  quantity_quoted?: number;
  unit_price?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  line_total?: number;
  notes?: string | null;
}

export interface PurchaseOrderQuotationRef {
  quotation_id: string;
  number: string;
}

export interface PurchaseOrderListItem {
  purchase_order_id: string;
  project_id: number;
  supplier: QuotationSupplierRef;
  // Ambos null = compra directa (sin requerimiento ni cotización detrás), pero igual de válida.
  purchase_requisition: QuotationRequisitionRef | null;
  quotation: PurchaseOrderQuotationRef | null;
  number: string;
  order_date: string;
  currency: Currency;
  commercial_terms: string | null;
  items_count: number;
  has_file: boolean;
  total_amount: string | null;
  lines_total: string;
  created_at: string;
}

export interface PurchaseOrderItem {
  purchase_order_item_id: string;
  quotation_item_id: string | null;
  purchase_requisition_item_id: string | null;
  // null en los tres si la línea es de compra directa (no cita nada, product_id propio).
  product: EmbeddedProduct | null;
  quotation_item: { description: string; quantity_quoted: string; unit_price: string | null } | null;
  requisition_item: { description: string; quantity_requested: string } | null;
  description: string;
  quantity_ordered: string;
  unit_price: string | null;
  discount_amount: string | null;
  tax_amount: string | null;
  line_total: string;
  notes: string | null;
  progress: PurchaseOrderItemProgress;
  alerts: DocumentAlert[];
}

export interface PurchaseOrderDetail extends PurchaseOrderListItem {
  items: PurchaseOrderItem[];
  file: DocumentFile | null;
  alerts: DocumentAlert[];
}

// Con origen (quotation_id o purchase_requisition_item_id): la línea SIEMPRE cita la línea de
// ese origen, nunca lleva product_id. Sin origen (compra directa): nunca cita nada, siempre
// lleva product_id. Mezclar ambos en la misma línea es justo lo que el backend rechaza.
export interface PurchaseOrderItemInput {
  quotation_item_id?: string | null;
  purchase_requisition_item_id?: string | null;
  product_id?: number | null;
  description: string;
  quantity_ordered: number;
  unit_price?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  line_total: number;
  notes?: string | null;
}

// Origen opcional a nivel de cabecera: quotation_id (el requerimiento se deduce solo),
// purchase_requisition_id solo, o ninguno de los dos (compra directa).
export interface PurchaseOrderCreateInput {
  supplier_id: number;
  quotation_id?: string | null;
  purchase_requisition_id?: string | null;
  number: string;
  order_date: string;
  currency: Currency;
  commercial_terms?: string | null;
  total_amount?: number | null;
  items: PurchaseOrderItemInput[];
}

// Cabecera parcial — proveedor y origen NO se cambian (identidad fijada al crear).
export interface PurchaseOrderUpdateInput {
  number?: string;
  order_date?: string;
  currency?: Currency;
  commercial_terms?: string | null;
  total_amount?: number | null;
}

export interface PurchaseOrderItemUpdateInput {
  description?: string;
  quantity_ordered?: number;
  unit_price?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  line_total?: number;
  notes?: string | null;
}

export interface InvoicePurchaseOrderRef {
  purchase_order_id: string;
  number: string;
}

export interface InvoiceListItem {
  invoice_id: string;
  project_id: number;
  supplier: QuotationSupplierRef;
  // null = factura directa (sin orden detrás) — igual de válida.
  purchase_order: InvoicePurchaseOrderRef | null;
  series: string;
  number: string;
  invoice_date: string; // AAAA-MM-DD
  currency: Currency;
  items_count: number;
  has_file: boolean;
  subtotal_amount: string | null;
  tax_amount: string | null;
  total_amount: string | null;
  lines_total: string;
  created_at: string;
}

export interface InvoiceItem {
  invoice_item_id: string;
  purchase_order_item_id: string | null;
  // null en ambos si la línea es directa (no cita nada, product_id propio).
  product: EmbeddedProduct | null;
  purchase_order_item: { purchase_order_item_id: string; description: string; quantity_ordered: string } | null;
  description: string;
  quantity_invoiced: string;
  unit_price: string | null;
  discount_amount: string | null;
  tax_amount: string | null;
  line_total: string;
  notes: string | null;
  // Avance ACUMULADO de la línea de orden que esta línea factura — null si la factura no tiene orden.
  purchase_order_progress: PurchaseOrderItemProgress | null;
  alerts: DocumentAlert[];
}

export interface InvoiceDetail extends InvoiceListItem {
  items: InvoiceItem[];
  file: DocumentFile | null;
  alerts: DocumentAlert[];
}

// Con orden: la línea SIEMPRE cita purchase_order_item_id, nunca lleva product_id. Sin orden
// (factura directa): nunca cita nada, siempre lleva product_id.
export interface InvoiceItemInput {
  purchase_order_item_id?: string | null;
  product_id?: number | null;
  description: string;
  quantity_invoiced: number;
  unit_price?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  line_total: number;
  notes?: string | null;
}

// Origen opcional: una sola orden (purchase_order_id) o ninguna (factura directa). Con orden,
// el proveedor de la factura tiene que ser el de esa orden.
export interface InvoiceCreateInput {
  supplier_id: number;
  purchase_order_id?: string | null;
  series: string; // 1-4 letras/números, el backend lo normaliza a mayúsculas
  number: string; // 1-8 dígitos
  invoice_date: string;
  currency: Currency;
  subtotal_amount?: number | null;
  tax_amount?: number | null;
  total_amount?: number | null;
  items: InvoiceItemInput[];
}

// Cabecera parcial — proveedor y orden NO se cambian (identidad fijada al crear).
export interface InvoiceUpdateInput {
  series?: string;
  number?: string;
  invoice_date?: string;
  currency?: Currency;
  subtotal_amount?: number | null;
  tax_amount?: number | null;
  total_amount?: number | null;
}

export interface InvoiceItemUpdateInput {
  description?: string;
  quantity_invoiced?: number;
  unit_price?: number | null;
  discount_amount?: number | null;
  tax_amount?: number | null;
  line_total?: number;
  notes?: string | null;
}

// ---------------------------------------------------------------------
// Trazabilidad documental y Hoja de vida (Fase 9) — todo de SOLO LECTURA.
// No existe una tabla "ingreso": el recorrido parte de cualquier documento y sigue los vínculos
// entre líneas. Solo cuentan documentos vigentes (los dados de baja no aparecen).
// ---------------------------------------------------------------------

export type TraceabilityDocumentType = 'requisition' | 'quotation' | 'purchase-order' | 'invoice' | 'goods-receipt';
export type TraceabilityDirection = 'backward' | 'forward' | 'all';

export interface TraceabilityAnchor {
  type: TraceabilityDocumentType;
  id: string;
  label: string;
}

export interface TraceabilitySupplierRef {
  supplier_id: number;
  name: string;
}

export interface TraceabilityDocumentRef {
  id: string;
  label: string; // "REQ-001", "F001-123", "T001-5"...
  date: string;
  supplier: TraceabilitySupplierRef | null;
  has_file: boolean;
  entry_type?: GoodsReceiptEntryType; // solo ingresos
  requester?: string; // solo requerimientos
  currency?: Currency;
  is_anchor: boolean;
}

export interface TraceabilityDocuments {
  requisitions: TraceabilityDocumentRef[];
  quotations: TraceabilityDocumentRef[];
  purchase_orders: TraceabilityDocumentRef[];
  invoices: TraceabilityDocumentRef[];
  goods_receipts: TraceabilityDocumentRef[];
}

export interface TraceabilityRequisitionItem {
  id: string;
  document_id: string; // apunta a un documento de `documents.requisitions`
  description: string;
  quantity_requested: string;
}

export interface TraceabilityQuotationItem {
  id: string;
  document_id: string;
  description: string;
  quantity_quoted: string;
  unit_price: string | null;
  line_total: string;
}

export interface TraceabilityOrderItem {
  id: string;
  document_id: string;
  description: string;
  quantity_ordered: string;
  unit_price: string | null;
  line_total: string;
}

export interface TraceabilityInvoiceItem {
  id: string;
  document_id: string;
  description: string;
  quantity_invoiced: string;
  unit_price: string | null;
  line_total: string;
}

export interface TraceabilityReceiptLocation {
  bin_id: string;
  label: string; // "Almacén · Estante · Casilla"
  quantity: string;
}

export interface TraceabilityReceiptItem {
  id: string;
  document_id: string;
  quantity_received: string;
  quantity_per_delivery_note: string | null;
  locations: TraceabilityReceiptLocation[];
}

// Un elemento (= un producto) con todas sus líneas encadenadas a través de las etapas. Sin
// vínculos (compra directa, entrada rápida, ingreso normal sin orden) forma su propio hilo de un
// solo documento.
export interface TraceabilityThread {
  product: { product_id: string; code: string; name: string; unit: string };
  contains_anchor: boolean;
  requisition_items: TraceabilityRequisitionItem[];
  quotation_items: TraceabilityQuotationItem[]; // varias = varias ofertas de proveedores
  purchase_order_items: TraceabilityOrderItem[];
  invoice_items: TraceabilityInvoiceItem[];
  receipt_items: TraceabilityReceiptItem[];
}

export interface TraceabilityResponse {
  anchor: TraceabilityAnchor;
  direction: TraceabilityDirection;
  truncated: boolean; // true si se alcanzó el tope de 2000 líneas y el recorrido quedó incompleto
  documents: TraceabilityDocuments;
  threads: TraceabilityThread[];
}

// Hoja de vida del producto — el catálogo a lo largo del tiempo, en dos procesos (ENTRADA/SALIDA).
// NO hay lotes: no se sabe qué unidades salieron de qué ingreso puntual. Cada entrada se despliega
// en la cadena de documentos que la originó (requerimiento → cotización → orden → factura → guía).
export type ProductHistoryType = 'entrada' | 'salida';

export interface ProductHistoryDocumentLine {
  document_id: string;
  item_id: string;
  label: string;
  date: string;
  description: string;
  quantity: string;
  unit_price: string | null;
  line_total: string | null;
  currency: Currency | null;
  supplier: QuotationSupplierRef | null;
  requester: string | null; // solo en la línea de requerimiento
}

export interface ProductHistoryDocuments {
  requisitions: ProductHistoryDocumentLine[];
  quotations: ProductHistoryDocumentLine[];
  purchase_orders: ProductHistoryDocumentLine[];
  invoices: ProductHistoryDocumentLine[];
}

export interface ProductHistoryLocation {
  bin_id: string;
  label: string;
  quantity: string;
  // Saldo TOTAL del producto en esa casilla justo después del movimiento (= Kardex).
  balance_after: string | null;
}

export interface ProductHistoryAdjustment {
  inventory_adjustment_id: string;
  kind: InventoryAdjustmentKind;
  label: string;
  reason: string;
  date: string;
  items: { bin_id: string; label: string; quantity_delta: string; stock_effect: string; balance_after: string | null }[];
}

export interface ProductHistoryEntry {
  type: 'entrada';
  // recibido = ya tiene guía; en_curso = hay documentos previos pero todavía no llegó (sin guía).
  status: 'recibido' | 'en_curso';
  date: string;
  label: string;
  voided: boolean;
  receipt: {
    goods_receipt_id: string;
    goods_receipt_item_id: string;
    label: string;
    delivery_note_date: string;
    received_date: string;
    entry_type: GoodsReceiptEntryType;
    supplier: QuotationSupplierRef;
    has_file: boolean;
    description: string;
    quantity_per_delivery_note: string | null;
  } | null;
  quantity_registered: string | null;
  quantity_adjusted: string | null;
  quantity_effective: string | null;
  locations: ProductHistoryLocation[];
  documents: ProductHistoryDocuments;
  adjustments: ProductHistoryAdjustment[];
}

export interface ProductHistoryExit {
  type: 'salida';
  date: string;
  label: string;
  voided: boolean;
  issue: {
    goods_issue_id: number;
    goods_issue_item_id: number;
    number: string;
    destination_sector: string;
    destination_level: string;
    destination_block: string;
    recipient_name: string; // NO incluye el DNI
  };
  quantity_registered: string;
  quantity_adjusted: string;
  quantity_effective: string;
  locations: ProductHistoryLocation[];
  adjustments: ProductHistoryAdjustment[];
}

export type ProductHistoryItem = ProductHistoryEntry | ProductHistoryExit;

export interface ProductHistoryStockByBin {
  bin_id: string;
  label: string;
  quantity: string;
}

export interface ProductHistoryResponse {
  product: EmbeddedProduct;
  filters: {
    bin_id: string | null; from: string | null; to: string | null;
    type: 'all' | ProductHistoryType; sort: 'date' | 'entrada_first' | 'salida_first'; direction: 'asc' | 'desc';
    include_in_progress: boolean;
  };
  stock: { total: string; by_bin: ProductHistoryStockByBin[] };
  totals: { entered: string; exited: string; net: string };
  items: ProductHistoryItem[];
  truncated: boolean;
}

// ---------------------------------------------------------------------
// Ajustes de inventario (Fase 10) — corrigen un ingreso o un vale YA registrados SIN reescribirlos:
// el original queda tal cual (total_quantity nunca cambia), el ajuste es un documento aparte que
// genera movimientos de stock normales. Solo "configure" corrige/anula (un Editor no, 403).
// ---------------------------------------------------------------------

export type InventoryAdjustmentKind = 'correccion' | 'anulacion';

export interface InventoryAdjustmentReferenceDocument {
  type: 'goods_receipt' | 'goods_issue';
  id: string;
  label: string;
}

export interface InventoryAdjustmentItem {
  inventory_adjustment_item_id: string;
  item_id: string; // goods_receipt_item_id o goods_issue_item_id, según el documento
  product: EmbeddedProduct;
  bin: { bin_id: string; label: string };
  quantity_delta: string; // con signo — cambio de la cantidad DEL DOCUMENTO en esa casilla
  stock_effect: string; // efecto real sobre el stock: + sube, - baja (no siempre igual a quantity_delta en un vale)
}

export interface InventoryAdjustment {
  inventory_adjustment_id: string;
  kind: InventoryAdjustmentKind;
  reference_document: InventoryAdjustmentReferenceDocument;
  reason: string;
  adjustment_date: string;
  created_at: string;
  created_by: number;
  items: InventoryAdjustmentItem[];
}

export interface GoodsReceiptAdjustmentItemInput {
  goods_receipt_item_id: number;
  bin_id: number;
  quantity_delta: number;
}

export interface GoodsReceiptAdjustmentInput {
  reason: string; // hasta 500 caracteres
  adjustment_date?: string; // opcional, hoy por defecto
  items: GoodsReceiptAdjustmentItemInput[];
}

export interface GoodsIssueAdjustmentItemInput {
  goods_issue_item_id: number;
  bin_id: number;
  quantity_delta: number;
}

export interface GoodsIssueAdjustmentInput {
  reason: string;
  adjustment_date?: string;
  items: GoodsIssueAdjustmentItemInput[];
}

// Revierte TODO lo efectivo del documento (registrado + ajustes previos) y lo marca anulado.
export interface VoidDocumentInput {
  reason: string;
  adjustment_date?: string;
}

// Resumen de un ajuste tal como se lista dentro de la línea de un ingreso/vale ya corregido.
export interface AppliedAdjustment {
  inventory_adjustment_id: string;
  kind: InventoryAdjustmentKind;
  reason: string;
  adjustment_date: string;
  bin_id: string;
  quantity_delta: string;
}

export interface EffectiveLocation {
  bin_id: string;
  label: string;
  quantity: string;
}
