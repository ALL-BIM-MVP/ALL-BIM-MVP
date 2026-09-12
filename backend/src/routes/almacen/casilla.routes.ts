import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { updateCasillaController } from '../../controllers/almacen/casilla.controller.js';

// Única mutación de casilla en esta fase — se generan solas con su
// estante (ver estante.routes.ts, POST .../estantes).
export const casillaRouter = Router();

casillaRouter.patch(
    '/:projectId/almacenes/:almacenId/estantes/:estanteId/casillas/:casillaId', requireAuth, updateCasillaController
);
