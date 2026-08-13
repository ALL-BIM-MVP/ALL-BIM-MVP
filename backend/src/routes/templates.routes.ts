import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
    createTemplateController, getTemplateByIdController, listTemplatesController,
    toggleTemplateColumnVisibilityController, updateTemplateColumnsController
} from '../controllers/templates.controller.js';

const router = Router();

// Sin requireRolePrivileges: las plantillas no son un recurso de
// administración de proyecto, son de cada usuario (o del sistema) —
// cualquier autenticado puede leer una plantilla del sistema o la suya
// propia, y guardar/editar la suya. El service es quien filtra el
// acceso real (is_system OR created_by = quien pide para leer; solo
// created_by, nunca is_system, para editar — ver assertTemplateEditable
// en templates.service.ts).
router.get('/', requireAuth, listTemplatesController);
router.get('/:templateId', requireAuth, getTemplateByIdController);
router.post('/', requireAuth, createTemplateController);
router.put('/:templateId/columns', requireAuth, updateTemplateColumnsController);
router.patch('/:templateId/columns/:columnId', requireAuth, toggleTemplateColumnVisibilityController);

export default router;
