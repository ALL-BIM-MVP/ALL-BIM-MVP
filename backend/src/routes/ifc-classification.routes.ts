import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
    getIfcClassificationConfigController, upsertIfcClassificationConfigController,
} from '../controllers/ifc-classification.controller.js';

// Config de clasificación (Fase 4) — cuelga de /api/projects, mismo
// router-por-proyecto que projectModulesRouter/projectIfcDocumentsRouter.
const router = Router();

router.get('/:projectId/ifc-classification-config', requireAuth, getIfcClassificationConfigController);
router.put('/:projectId/ifc-classification-config', requireAuth, upsertIfcClassificationConfigController);

export default router;
