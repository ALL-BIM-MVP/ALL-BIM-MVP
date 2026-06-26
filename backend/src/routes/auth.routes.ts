import { Router } from 'express';
import { invitationController, loginController, validateInvitationController } from '../controllers/auth.controller.js';

const router = Router();


router.post('/login', loginController);
router.post('/invitations', invitationController);
router.post('/invitations/validate', validateInvitationController);


export default router;