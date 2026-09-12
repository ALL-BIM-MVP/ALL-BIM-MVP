import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { buscarUbicacionController } from '../../controllers/almacen/ubicacion-busqueda.controller.js';

export const ubicacionBusquedaRouter = Router();

ubicacionBusquedaRouter.get('/:projectId/ubicaciones/buscar', requireAuth, buscarUbicacionController);
