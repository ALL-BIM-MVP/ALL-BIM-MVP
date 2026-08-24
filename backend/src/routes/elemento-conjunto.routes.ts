import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
    getAvailableElementoConjuntoFieldsController, getElementoConjuntoConfigController,
    upsertElementoConjuntoConfigController,
} from '../controllers/elemento-conjunto.controller.js';

// Config de qué campos componen "elemento conjunto" — cuelga de
// /api/projects, mismo router-por-proyecto que ifc-classification.routes.ts.
const router = Router();

router.get('/:projectId/elemento-conjunto-config/available-fields', requireAuth, getAvailableElementoConjuntoFieldsController);
router.get('/:projectId/elemento-conjunto-config', requireAuth, getElementoConjuntoConfigController);
router.put('/:projectId/elemento-conjunto-config', requireAuth, upsertElementoConjuntoConfigController);

export default router;
