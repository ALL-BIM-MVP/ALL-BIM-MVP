import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
    createInvitationToProjectController, getListInvitationsOfProjectController,
    getUsersSuggestionForInvitationToProjectController, updateStatusInvitationController,
} from '../controllers/project-invitations.controller.js';

const router = Router();

// Listar/crear invitación — solo owner/admin del proyecto
// (assertProjectAdmin en el service, ya no el rol de cuenta).
router.get('/:projectId/invitations', requireAuth, getListInvitationsOfProjectController);

router.get('/:projectId/invitations/search-users', requireAuth, getUsersSuggestionForInvitationToProjectController);

router.post('/:projectId/invitations', requireAuth, createInvitationToProjectController);

// Responder (aceptar/rechazar/cancelar) — sin chequeo de rol/admin acá,
// lo resuelve el propio service según quién sea (el invitado para
// aceptar/rechazar, el owner para cancelar).
router.patch('/:projectId/invitations/:invitationId', requireAuth,
    updateStatusInvitationController);

export default router;
