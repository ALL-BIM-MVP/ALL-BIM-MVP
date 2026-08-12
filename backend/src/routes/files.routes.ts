import { Router } from 'express';
import { uploadSingleFile } from '../middlewares/upload.midleware.js';
import { getFileContentController, getProjectFilesController, saveFileController } from '../controllers/files.controller.js';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.post('/:projectId/files', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR, ROLES.USUARIO),
    uploadSingleFile, saveFileController);

router.get('/:projectId/files', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR, ROLES.USUARIO),
    getProjectFilesController);

export default router;

export const fileContentRouter = Router();

fileContentRouter.get('/:fileId/content', requireAuth, getFileContentController);
