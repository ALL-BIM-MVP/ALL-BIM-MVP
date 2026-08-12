import { Router } from 'express';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import {
    getCurrentUserProjectRoleController, getListProjectMembersController,
    removeProjectMemberController, updateProjectMemberRoleController
} from '../controllers/project-members.controller.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.get('/:projectId/members', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    getListProjectMembersController);

// Sin requireRolePrivileges a propósito: cualquier usuario autenticado
// (dueño o miembro, cualquier rol) necesita poder consultar su PROPIO
// rol en el proyecto — a diferencia del listado de arriba, que sí es
// solo para quien gestiona el proyecto.
router.get('/:projectId/user-role', requireAuth, getCurrentUserProjectRoleController);

router.patch('/:projectId/members/:memberId', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    updateProjectMemberRoleController);

router.delete('/:projectId/members/:userId', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    removeProjectMemberController);

export default router;
