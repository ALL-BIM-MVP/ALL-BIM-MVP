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
  model_3d_path: string | null;
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
export type Model3DSource = 'repositorio' | 'subido' | 'generado_ia';

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
  model_3d_path: string | null;
  model_3d_format: Model3DFormat | null;
  model_3d_source: Model3DSource | null;
  total_stock: number;
  main_location: string | null;
  // Solo viene en el detalle (GET .../products/:id), y solo tiene datos
  // reales cuando este producto es de categoría 'fijo' (una Partida) —
  // sus Materiales/Equipos relacionados. [] en cualquier otro caso.
  related?: Pick<Product, 'product_id' | 'code' | 'name'>[];
}

// code y base_product_code son excluyentes — cuál hace falta lo decide
// categories.type (fijo → code, relacional → base_product_code), el
// backend arma el code final solo (ej. "MAT-01.02.03").
export interface ProductCreateInput {
  category_id: number;
  code?: string;
  base_product_code?: string;
  name: string;
  unit: string;
  model_3d_path?: string;
  model_3d_format?: Model3DFormat;
  model_3d_source?: Model3DSource;
}

// A propósito sin category_id/code/base_product_code — son la
// identidad del producto, fijada al crearlo.
export interface ProductUpdateInput {
  name: string;
  unit: string;
  model_3d_path?: string | null;
  model_3d_format?: Model3DFormat | null;
  model_3d_source?: Model3DSource | null;
}

// goods_receipts (Ingreso) — movimiento inmutable: sin PUT/DELETE, un
// error se corrige con un movimiento nuevo, nunca reescribiendo este.
export interface GoodsReceiptItemLocationInput {
  bin_id: number;
  quantity: number;
}

export interface GoodsReceiptItemInput {
  product_id: number;
  total_quantity: number;
  // La suma tiene que dar EXACTO total_quantity — lo valida el backend, y también el form antes de mandarlo.
  locations: GoodsReceiptItemLocationInput[];
}

export interface GoodsReceiptInput {
  supplier_ruc: string;
  supplier_name: string;
  delivery_note_number: string;
  purchase_date: string; // ISO (yyyy-mm-dd)
  items: GoodsReceiptItemInput[];
}

export interface GoodsReceiptItemLocation {
  goods_receipt_item_location_id: number;
  goods_receipt_item_id: number;
  bin_id: number;
  quantity: number;
}

export interface GoodsReceiptItem {
  goods_receipt_item_id: number;
  goods_receipt_id: number;
  product_id: number;
  total_quantity: number;
  locations: GoodsReceiptItemLocation[];
}

export interface GoodsReceipt {
  goods_receipt_id: number;
  project_id: number;
  supplier_ruc: string;
  supplier_name: string;
  delivery_note_number: string;
  purchase_date: string;
  created_at: string;
  items?: GoodsReceiptItem[]; // solo en el detalle, no en el listado
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
  created_at: string;
}

export interface InventoryMovementFilters {
  product_id?: number;
  from?: string; // ISO (yyyy-mm-dd)
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
