import { Router } from 'express';
import { createProjectController, deleteProjectByIdController, getListProjectsController, getProjectByIdController, updateProjectController } from '../controllers/projects.controller.js';
import {
    deleteProjectCoverImageController, setProjectCoverImageController
} from '../controllers/project-images.controller.js';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { uploadCoverImage } from '../middlewares/upload.midleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.get('/',requireAuth, getListProjectsController);
router.get('/:projectId', requireAuth, getProjectByIdController);

router.post('/', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    createProjectController);

router.patch('/:projectId', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    updateProjectController);

router.delete('/:projectId', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    deleteProjectByIdController);

// Imagen de portada — leer NO tiene ruta acá (viaja embebida en
// cover_image.url dentro de GET / y GET /:projectId, servida pública
// por el mount estático de /uploads en index.ts). Fijar/borrar sí
// requieren el mismo rol que editar/borrar el proyecto, y el service
// todavía exige ser el DUEÑO puntual, no cualquiera con ese rol.
//
// PUT y no POST a propósito: fijar la portada es un reemplazo
// idempotente de un slot fijo en una URI conocida (siempre hay como
// máximo una, nunca se "crea otra"), no la creación de un recurso
// nuevo — mismo criterio que ya usa PUT /templates/:id/columns en
// este mismo backend.
//
// uploadCoverImage, NO uploadSingleFile — guarda directo bajo la
// carpeta pública (uploads/public/covers/), nunca en uploads/:projectId/
// donde viven los archivos privados. Ver upload.midleware.ts.
router.put('/:projectId/image', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    uploadCoverImage, setProjectCoverImageController);

router.delete('/:projectId/image', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR),
    deleteProjectCoverImageController);

export default router;