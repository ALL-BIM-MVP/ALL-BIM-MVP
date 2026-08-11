import { Router } from 'express';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { getListProjectMembersController, removeProjectMemberController, updateProjectMemberRoleController } from '../controllers/project-members.controller.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.get('/:projectId/members', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    getListProjectMembersController);

router.patch('/:projectId/members/:memberId', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    updateProjectMemberRoleController);

router.delete('/:projectId/members/:userId', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    removeProjectMemberController);

export default router;
