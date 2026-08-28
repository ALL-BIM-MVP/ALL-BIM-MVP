import { Router } from 'express';
import { uploadDryRunFile, uploadSingleFile } from '../middlewares/upload.midleware.js';
import {
    classificationDryRunController, getIfcFileStatusController, processIfcMetradosController,
} from '../controllers/ifc-metrados.controller.js';
import {
    getElementMetradoController, getPartidaElementsController, getPartidasTreeController
} from '../controllers/metrado-partidas.controller.js';
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

// Consolidación punto 5 — "probar" una config de clasificación manual
// sin correr el pipeline completo. uploadDryRunFile (NO uploadSingleFile)
// a propósito: el archivo, si viene, es solo para esta prueba puntual,
// nunca se guarda en UPLOADS_DIR ni se crea ninguna fila — ver
// ifc-metrados.service.ts.
router.post(
    '/:projectId/ifc-metrados/classification-dry-run', requireAuth, uploadDryRunFile, classificationDryRunController
);

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

// Metrado de un elemento puntual (mejoras-backend-post-auditoria.md,
// punto 1) — el pedido del cliente: clickear un elemento en el visor
// y ver a qué partida pertenece, sin traer los demás elementos de esa
// partida (eso es POST .../partidas/:partidaId/elements, aparte).
ifcFilesRouter.get('/:ifcFileId/elements/:expressId/metrado', requireAuth, getElementMetradoController);

// Catálogo (builtin + propiedades IFC de ESTE archivo) para armar o
// editar columnas de plantilla en el frontend.
ifcFilesRouter.get('/:ifcFileId/available-columns', requireAuth, getAvailableColumnsController);

// Genera un Excel (formato fijo, Fase 5) a partir del metrado YA
// procesado de esta versión — permiso 'export' del módulo, resuelto
// en generateExcelExportService. Se puede llamar más de una vez, cada
// llamada crea un archivo nuevo (nunca pisa el anterior).
ifcFilesRouter.post('/:ifcFileId/export-excel', requireAuth, generateExcelExportController);
