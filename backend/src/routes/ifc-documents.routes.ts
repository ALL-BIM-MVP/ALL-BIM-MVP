import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { getIfcSpecialtiesController, listIfcDocumentsController } from '../controllers/ifc-documents.controller.js';

// Catálogo — mismo criterio que modules.routes.ts: no depende de
// ningún proyecto, cualquier cuenta autenticada puede leerlo.
const router = Router();

router.get('/', requireAuth, getIfcSpecialtiesController);

export default router;

// Documentos IFC de un proyecto (identidad + versiones) — mismo router
// aparte montado en /api/projects que projectModulesRouter.
export const projectIfcDocumentsRouter = Router();

projectIfcDocumentsRouter.get('/:projectId/ifc-documents', requireAuth, listIfcDocumentsController);
