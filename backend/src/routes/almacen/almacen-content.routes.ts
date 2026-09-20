import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    emptyAlmacenContentController, getAlmacenSummaryController,
} from '../../controllers/almacen/almacen-content.controller.js';

export const almacenContentRouter = Router();

almacenContentRouter.get('/:projectId/almacen/summary', requireAuth, getAlmacenSummaryController);
// Destructivo e irreversible — solo dueño/administrador del proyecto
// (lo exige el service, no esta ruta).
almacenContentRouter.delete('/:projectId/almacen/content', requireAuth, emptyAlmacenContentController);
