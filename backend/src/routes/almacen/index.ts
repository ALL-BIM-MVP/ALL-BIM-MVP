// Punto de entrada único del módulo Almacén BIM (Fase 2/3, ver
// docs/roadmap/almacen-bim.md) — junta los routers sueltos de cada
// entidad (un archivo por entidad, ver el resto de esta carpeta) en
// los 3 puntos de montaje reales de index.ts: `warehouseStyleRouter`
// (catálogo global, /api/warehouse-styles), `model3DAssetUploadRouter`
// (biblioteca personal del usuario, /api/model-3d-assets — mismo
// criterio que warehouseStyleRouter, tampoco cuelga de /api/projects)
// y `projectAlmacenRouter` (todo lo que sí cuelga de /api/projects). El
// nombre `projectAlmacenRouter` mantiene "Almacen" (no "Warehouse") a
// propósito: agrupa TODO el módulo, no solo la entidad warehouse —
// mismo criterio que ALMACEN_MODULE_CODE en warehouse.service.ts.
import { Router } from 'express';
import { warehouseStyleRouter } from './warehouse-style.routes.js';
import { warehouseRouter } from './warehouse.routes.js';
import { rackRouter } from './rack.routes.js';
import { binRouter } from './bin.routes.js';
import { locationSearchRouter } from './location-search.routes.js';
import { categoryRouter } from './category.routes.js';
import { productRouter } from './product.routes.js';
import { model3DAssetRouter, model3DAssetUploadRouter } from './model-3d-asset.routes.js';
import { goodsReceiptRouter } from './goods-receipt.routes.js';
import { goodsIssueRouter } from './goods-issue.routes.js';
import { inventoryMovementRouter } from './inventory-movement.routes.js';
import { almacenContentRouter } from './almacen-content.routes.js';

export { warehouseStyleRouter, model3DAssetUploadRouter };

export const projectAlmacenRouter = Router();
projectAlmacenRouter.use(almacenContentRouter);
projectAlmacenRouter.use(locationSearchRouter);
projectAlmacenRouter.use(warehouseRouter);
projectAlmacenRouter.use(rackRouter);
projectAlmacenRouter.use(binRouter);
projectAlmacenRouter.use(categoryRouter);
projectAlmacenRouter.use(productRouter);
projectAlmacenRouter.use(model3DAssetRouter);
projectAlmacenRouter.use(goodsReceiptRouter);
projectAlmacenRouter.use(goodsIssueRouter);
projectAlmacenRouter.use(inventoryMovementRouter);
