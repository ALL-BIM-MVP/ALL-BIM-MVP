import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { createDocumentDraftController } from '../../controllers/almacen/document-draft.controller.js';

// Lectura de un documento con IA: NO crea nada, devuelve un borrador para que el usuario lo revise.
// Permiso "process" (igual que crear el documento).
export const documentDraftRouter = Router();

documentDraftRouter.post('/:projectId/document-drafts', requireAuth, createDocumentDraftController);
