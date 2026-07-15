import { Router } from 'express';
import { getAllUsersController, getMeController, registerController } from '../controllers/users.controller.js';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { ROLES } from '../constants/roles.js';
import { getMeInvitationsToProjectsController } from '../controllers/project-invitations.controller.js';

const router = Router();

router.post('/register', registerController);
router.get('/me', requireAuth, getMeController);

router.get('/',requireAuth, requireRolePrivileges(ROLES.ADMINISTRADOR), getAllUsersController);

router.get('/invitations', requireAuth, getMeInvitationsToProjectsController);

export default router;