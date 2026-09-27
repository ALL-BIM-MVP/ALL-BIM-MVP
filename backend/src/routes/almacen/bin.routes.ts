import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { updateBinContentPoseController, updateBinController } from '../../controllers/almacen/bin.controller.js';

export const binRouter = Router();

binRouter.patch(
    '/:projectId/warehouses/:warehouseId/racks/:rackId/bins/:binId', requireAuth, updateBinController
);
// Posición/rotación/escala de un contenido dentro de su casilla — 2026-09-26, ver
// docs/almacen-ingreso-productos/09-roadmap-correcciones-2026-09-26.md, Fase A.
binRouter.patch(
    '/:projectId/warehouses/:warehouseId/racks/:rackId/bins/:binId/contents/:binContentId', requireAuth, updateBinContentPoseController
);
