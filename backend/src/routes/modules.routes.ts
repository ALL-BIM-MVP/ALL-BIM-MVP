import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
    getModuleAccessController, getModuleRolesController, getModulesController, getMyModulesAccessController,
} from '../controllers/modules.controller.js';

// Catálogo — no depende de ningún proyecto, cualquier cuenta
// autenticada puede leerlo (lo necesita, por ejemplo, para armar el
// selector de roles al invitar a alguien).
const router = Router();

router.get('/', requireAuth, getModulesController);
router.get('/:moduleCode/roles', requireAuth, getModuleRolesController);

export default router;

// Resolución por proyecto — mismo router que project-members/
// project-invitations, montado en /api/projects.
export const projectModulesRouter = Router();

projectModulesRouter.get('/:projectId/modules/:moduleCode/access', requireAuth, getModuleAccessController);
projectModulesRouter.get('/:projectId/my-modules', requireAuth, getMyModulesAccessController);
