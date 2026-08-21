import { Router } from 'express';
import {
    deleteProfilePictureController, deleteSelfController, deleteUserByAdminController,
    getAllUsersController, getMeController, registerController,
    setUserActiveController, updateMeController, uploadProfilePictureController,
} from '../controllers/users.controller.js';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { uploadProfilePicture } from '../middlewares/upload.midleware.js';
import { ROLES } from '../constants/roles.js';
import { getMeInvitationsToProjectsController } from '../controllers/project-invitations.controller.js';

const router = Router();

router.post('/register', registerController);
router.get('/me', requireAuth, getMeController);

// ------------------------------------------------------------
// Autogestión — cada usuario sobre sus propios datos, sin chequeo de
// rol (cualquier cuenta autenticada puede editar/borrar SU PROPIO
// perfil).
// ------------------------------------------------------------
router.patch('/me', requireAuth, updateMeController);
router.put('/me/photo', requireAuth, uploadProfilePicture, uploadProfilePictureController);
router.delete('/me/photo', requireAuth, deleteProfilePictureController);
// Baja directa, sin estado de suspensión previo (ver
// docs/roadmap-modulos-y-permisos.md, Fase 1) — is_deleted=true de una,
// no reversible desde la API.
router.delete('/me', requireAuth, deleteSelfController);

router.get('/',requireAuth, requireRolePrivileges(ROLES.ADMINISTRADOR), getAllUsersController);

router.get('/invitations', requireAuth, getMeInvitationsToProjectsController);

// ------------------------------------------------------------
// Administración de OTRAS cuentas — solo ADMINISTRADOR (rol de
// cuenta, no de proyecto). Nunca sobre uno mismo, ver
// USER_ERRORS.CANNOT_TARGET_SELF en el service.
// ------------------------------------------------------------
router.patch('/:userId/active', requireAuth, requireRolePrivileges(ROLES.ADMINISTRADOR), setUserActiveController);
router.delete('/:userId', requireAuth, requireRolePrivileges(ROLES.ADMINISTRADOR), deleteUserByAdminController);

export default router;
