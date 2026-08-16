import { Router } from 'express';
import { uploadSingleFile } from '../middlewares/upload.midleware.js';
import {
    deleteFileController, getFileContentController, getFileThumbnailController,
    getProjectFilesController, saveFileController
} from '../controllers/files.controller.js';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { authorizeFileAccess } from '../middlewares/file-access.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.post('/:projectId/files', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR, ROLES.USUARIO),
    uploadSingleFile, saveFileController);

router.get('/:projectId/files', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR, ROLES.USUARIO),
    getProjectFilesController);

// Sin requireRolePrivileges extra: el service es más estricto que el
// rol (solo quien subió el archivo o el dueño del proyecto puede
// borrarlo, ver deleteFileService) — el rol de proyecto por sí solo no
// alcanza ni hace falta acá.
router.delete('/:projectId/files/:fileId', requireAuth, deleteFileController);

export default router;

export const fileContentRouter = Router();

// authorizeFileAccess acepta ?token= firmado (para <img src="...">
// directo, sin Authorization) O Authorization: Bearer normal — ver
// middlewares/file-access.middleware.ts.
fileContentRouter.get('/:fileId/content', authorizeFileAccess('content'), getFileContentController);
fileContentRouter.get('/:fileId/thumbnail', authorizeFileAccess('thumbnail'), getFileThumbnailController);
