import { Router } from 'express';
import { uploadSingleFile } from '../middlewares/upload.midleware.js';
import { getIfcFileStatusController, processIfcMetradosController } from '../controllers/ifc-metrados.controller.js';
import { getPartidaElementsController, getPartidasTreeController } from '../controllers/metrado-partidas.controller.js';
import { getAvailableColumnsController } from '../controllers/templates.controller.js';
import { getEstadoElementosController } from '../controllers/metrados-estado.controller.js';
import { generateExcelExportController } from '../controllers/ifc-excel-export.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

const router = Router();

// Sin chequeo de rol de cuenta — el permiso real ('upload'/'process'
// del módulo Metrados) se resuelve en processIfcMetradosService (Fase
// 2, ver docs/roadmap-modulos-y-permisos.md).
router.post('/:projectId/ifc-metrados/process', requireAuth, uploadSingleFile, processIfcMetradosController);

// "Muestra de estado de cantidad de elementos" (prototipo) — a nivel
// de PROYECTO, no de un solo archivo, ver metrados-estado.models.ts.
router.get('/:projectId/metrados/estado-elementos', requireAuth, getEstadoElementosController);

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

// Genera un Excel (formato fijo, Fase 5) a partir del metrado YA
// procesado de esta versión — permiso 'export' del módulo, resuelto
// en generateExcelExportService. Se puede llamar más de una vez, cada
// llamada crea un archivo nuevo (nunca pisa el anterior).
ifcFilesRouter.post('/:ifcFileId/export-excel', requireAuth, generateExcelExportController);
