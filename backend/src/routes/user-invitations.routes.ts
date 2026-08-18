import { Router } from 'express'
import { createInvitationController, getUserInvitationsHistoryController, validateInvitationController } from '../controllers/user-invitations.controller.js';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.post('/',requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.SUPERVISOR),
    createInvitationController);

// Historial de invitaciones enviadas (user_invitations) — mismo criterio
// de rol que crearlas, no cualquier rol puede ver a quién se invitó.
router.get('/', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.SUPERVISOR),
    getUserInvitationsHistoryController);

router.get('/validate', validateInvitationController);

export default router;