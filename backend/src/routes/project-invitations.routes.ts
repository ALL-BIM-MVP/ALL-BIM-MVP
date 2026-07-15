import { Router } from 'express';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { createInvitationToProjectController, getListInvitationsOfProjectController, getUsersSuggestionForInvitationToProjectController, updateStatusInvitationController } from '../controllers/project-invitations.controller.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.get('/:projectId/invitations', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    getListInvitationsOfProjectController);

router.get('/:projectId/invitations/search-users', requireAuth, 
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    getUsersSuggestionForInvitationToProjectController);

router.post('/:projectId/invitations', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    createInvitationToProjectController);

router.patch('/:projectId/invitations/:invitationId', requireAuth, 
    updateStatusInvitationController);

export default router;