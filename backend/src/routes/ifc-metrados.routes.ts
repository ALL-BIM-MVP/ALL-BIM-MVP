import { Router } from 'express';
import { uploadSingleFile } from '../middlewares/upload.midleware.js';
import { getIfcFileStatusController, processIfcMetradosController } from '../controllers/ifc-metrados.controller.js';
import { getPartidaElementsController, getPartidasTreeController } from '../controllers/metrado-partidas.controller.js';
import { getAvailableColumnsController } from '../controllers/templates.controller.js';
import { requireAuth, requireRolePrivileges } from '../middlewares/auth.middleware.js';
import { ROLES } from '../constants/roles.js';

const router = Router();

router.post('/:projectId/ifc-metrados/process', requireAuth,
    requireRolePrivileges(ROLES.ADMINISTRADOR, ROLES.MODERADOR, ROLES.SUPERVISOR, ROLES.USUARIO),
    uploadSingleFile, processIfcMetradosController);

export default router;

export const ifcFilesRouter = Router();

ifcFilesRouter.get('/:ifcFileId', requireAuth, getIfcFileStatusController);

// Árbol liviano (Resumido) — sin estructura de columnas, siempre los
// mismos campos fijos.
ifcFilesRouter.get('/:ifcFileId/partidas', requireAuth, getPartidasTreeController);

// Detalle de una partida (Detallado) — agrupado por nivel/espacio/tag.
// Todavía no hay sistema de plantillas: siempre usa el set de columnas
// por defecto (ver comentario en ifc-metrados.schema.ts).
ifcFilesRouter.post('/:ifcFileId/partidas/:partidaId/elements', requireAuth, getPartidaElementsController);

// Catálogo (builtin + propiedades IFC de ESTE archivo) para armar o
// editar columnas de plantilla en el frontend.
ifcFilesRouter.get('/:ifcFileId/available-columns', requireAuth, getAvailableColumnsController);
