import { Router } from 'express'
import { createInvitationController, validateInvitationController } from '../controllers/user-invitations.controller.js';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.post('/',requireAuth, 
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.SUPERVISOR), 
    createInvitationController);
router.get('/validate', validateInvitationController);

export default router;