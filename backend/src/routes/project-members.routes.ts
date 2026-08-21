import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
    getListProjectMembersController, removeProjectMemberController,
    setMemberAdminController, setMemberModuleRoleController,
} from '../controllers/project-members.controller.js';

const router = Router();

// Cualquier miembro (u owner) puede leer la lista — el chequeo real
// (owner-o-miembro) vive en el service (assertProjectAccess), no acá.
router.get('/:projectId/members', requireAuth, getListProjectMembersController);

// Gestión — solo owner/admin (assertProjectAdmin en el service).
router.patch('/:projectId/members/:memberId/admin', requireAuth, setMemberAdminController);
router.put('/:projectId/members/:memberId/modules/:moduleCode/role', requireAuth, setMemberModuleRoleController);
router.delete('/:projectId/members/:userId', requireAuth, removeProjectMemberController);

export default router;
