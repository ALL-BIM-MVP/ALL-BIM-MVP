import { Router } from 'express';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { ROLES } from '../constants/roles.js';
import { createProjectRoleController, deleteProjectRoleByIdController, getListProjectRoleController, updateProjectRoleController } from '../controllers/project-roles.controller.js';
import { deleteProjectByIdController } from '../controllers/projects.controller.js';

const router = Router();

router.get('/', requireAuth, 
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    getListProjectRoleController
);

router.post('/', requireAuth ,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    createProjectRoleController
);

router.patch('/:projectRoleId', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    updateProjectRoleController
);

router.delete('/:projectRoleId', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    deleteProjectRoleByIdController
);

export default router;