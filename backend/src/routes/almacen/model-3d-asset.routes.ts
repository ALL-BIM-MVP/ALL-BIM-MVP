import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { uploadModel3DAssetFile } from '../../middlewares/upload.midleware.js';
import {
    getModel3DAssetContentController, listModel3DAssetsController, uploadModel3DAssetController,
} from '../../controllers/almacen/model-3d-asset.controller.js';

// Global, SIN proyecto en la URL — sube a la biblioteca personal del
// usuario (ver model-3d-asset.service.ts), no depende de ningún
// proyecto. Se monta aparte en index.ts (/api/model-3d-assets), mismo
// criterio que warehouseStyleRouter (/api/warehouse-styles) — no
// cuelga de /api/projects como el resto de este módulo.
export const model3DAssetUploadRouter = Router();
model3DAssetUploadRouter.post('/', requireAuth, uploadModel3DAssetFile, uploadModel3DAssetController);

// Anidados bajo /api/projects — listar y servir SÍ necesitan "desde
// qué proyecto" para resolver visibilidad (ver VISIBILITY_CLAUSE).
export const model3DAssetRouter = Router();
model3DAssetRouter.get('/:projectId/model-3d-assets', requireAuth, listModel3DAssetsController);
model3DAssetRouter.get('/:projectId/model-3d-assets/:assetId/content', requireAuth, getModel3DAssetContentController);
