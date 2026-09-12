import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { listAlmacenEstilosController } from '../../controllers/almacen/almacen-estilo.controller.js';

// Catálogo global — sin depender de ningún proyecto, mismo criterio
// que ifc-documents.routes.ts (getIfcSpecialtiesController). Se monta
// aparte en /api/almacen-estilos (ver index.ts), no adentro de
// /api/projects como el resto de este módulo.
export const almacenEstiloRouter = Router();
almacenEstiloRouter.get('/', requireAuth, listAlmacenEstilosController);
