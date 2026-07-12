import { Router } from 'express';
import { createProjectController, deleteProjectByIdController, getListProjectsController, getProjectByIdController, updateProjectController } from '../controllers/projects.controller.js';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.get('/',requireAuth, getListProjectsController);
router.get('/:projectId', requireAuth, getProjectByIdController);

router.post('/', requireAuth, 
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR), 
    createProjectController);

router.patch('/:projectId', requireAuth, 
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    updateProjectController);

router.delete('/:projectId', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    deleteProjectByIdController);

export default router;