import { Router } from 'express';
import { uploadSingleFile } from '../middlewares/upload.midleware.js';
import { getIfcFileStatusController, processIfcMetradosController } from '../controllers/ifc-metrados.controller.js';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.post('/:projectId/ifc-metrados/process', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR, ROLES.USUARIO),
    uploadSingleFile, processIfcMetradosController);

export default router;

export const ifcFilesRouter = Router();

ifcFilesRouter.get('/:ifcFileId', requireAuth, getIfcFileStatusController);
