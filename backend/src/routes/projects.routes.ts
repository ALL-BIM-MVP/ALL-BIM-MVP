import { Router } from 'express';
import { createProjectController, deleteProjectByIdController, getListProjectsController, getProjectByIdController, updateProjectController } from '../controllers/projects.controller.js';
import {
    deleteProjectCoverImageController, setProjectCoverImageController
} from '../controllers/project-images.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { uploadCoverImage } from '../middlewares/upload.midleware.js';

const router = Router();

router.get('/',requireAuth, getListProjectsController);
router.get('/:projectId', requireAuth, getProjectByIdController);

// Crear proyecto: no hay chequeo de rol de proyecto posible todavía
// (el proyecto ni existe) — cualquier cuenta autenticada puede crear
// uno, y se vuelve su owner automáticamente (ver createProjectService).
router.post('/', requireAuth, createProjectController);

// Editar/borrar: el service sigue exigiendo ser el OWNER puntual (sin
// cambios acá, ver updateProjectService/deleteProjectByIdService) — ya
// no depende del rol de cuenta (Fase 2, ver
// docs/roadmap-modulos-y-permisos.md). Nota: no se amplió todavía a
// "owner o admin" — queda anotado como posible ajuste, no asumido.
router.patch('/:projectId', requireAuth, updateProjectController);

router.delete('/:projectId', requireAuth, deleteProjectByIdController);

// Imagen de portada — leer NO tiene ruta acá (viaja embebida en
// cover_image.url dentro de GET / y GET /:projectId, servida pública
// por el mount estático de /uploads en index.ts). Fijar/borrar siguen
// exigiendo ser el OWNER puntual (assertProjectOwnership en el
// service, sin cambios).
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
router.put('/:projectId/image', requireAuth, uploadCoverImage, setProjectCoverImageController);

router.delete('/:projectId/image', requireAuth, deleteProjectCoverImageController);

export default router;
