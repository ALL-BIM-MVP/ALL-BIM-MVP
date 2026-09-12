import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import {
    createEstanteController, deleteEstanteController, getEstanteByIdController, listEstantesController,
    updateEstanteController,
} from '../../controllers/almacen/estante.controller.js';

export const estanteRouter = Router();

estanteRouter.get('/:projectId/almacenes/:almacenId/estantes', requireAuth, listEstantesController);
estanteRouter.post('/:projectId/almacenes/:almacenId/estantes', requireAuth, createEstanteController);
estanteRouter.get('/:projectId/almacenes/:almacenId/estantes/:estanteId', requireAuth, getEstanteByIdController);
estanteRouter.put('/:projectId/almacenes/:almacenId/estantes/:estanteId', requireAuth, updateEstanteController);
estanteRouter.delete('/:projectId/almacenes/:almacenId/estantes/:estanteId', requireAuth, deleteEstanteController);
