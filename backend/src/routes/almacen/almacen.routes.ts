import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    createAlmacenController, deleteAlmacenController, getAlmacenByIdController, listAlmacenesController,
    updateAlmacenController,
} from '../../controllers/almacen/almacen.controller.js';

// Cuelga de /api/projects (ver routes/almacen/index.ts e index.ts) — el
// permiso real de cada operación (view/process/delete del módulo
// `almacen`) se resuelve adentro del service, no acá.
export const almacenRouter = Router();

almacenRouter.get('/:projectId/almacenes', requireAuth, listAlmacenesController);
almacenRouter.post('/:projectId/almacenes', requireAuth, createAlmacenController);
almacenRouter.get('/:projectId/almacenes/:almacenId', requireAuth, getAlmacenByIdController);
almacenRouter.put('/:projectId/almacenes/:almacenId', requireAuth, updateAlmacenController);
almacenRouter.delete('/:projectId/almacenes/:almacenId', requireAuth, deleteAlmacenController);
