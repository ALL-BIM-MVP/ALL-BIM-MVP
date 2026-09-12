import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { listWarehouseStylesController } from '../../controllers/almacen/warehouse-style.controller.js';

// Catálogo global — sin depender de ningún proyecto, mismo criterio
// que ifc-documents.routes.ts (getIfcSpecialtiesController). Se monta
// aparte en /api/warehouse-styles (ver index.ts), no adentro de
// /api/projects como el resto de este módulo.
export const warehouseStyleRouter = Router();
warehouseStyleRouter.get('/', requireAuth, listWarehouseStylesController);
