import { Router } from 'express';
import { uploadSingleFile } from '../middlewares/upload.midleware.js';
import {
    deleteFileController, getFileContentController, getFileThumbnailController,
    getProjectFilesController, saveFileController
} from '../controllers/files.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { authorizeFileAccess } from '../middlewares/file-access.middleware.js';

const router = Router();

// Sin chequeo de rol de cuenta (Fase 2) — la autorización real sigue
// siendo assertProjectAccess (owner o miembro) dentro del service, sin
// cambios. Archivos todavía NO están atados a un módulo puntual (eso
// es la Fase 6, "archivos por módulo", deliberadamente al final del
// roadmap) — por eso acá NO se agregó ningún assertModulePermission
// todavía, a diferencia de ifc-metrados.routes.ts.
router.post('/:projectId/files', requireAuth, uploadSingleFile, saveFileController);

router.get('/:projectId/files', requireAuth, getProjectFilesController);

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
