import { Router } from 'express';
import { invitationController, loginController, validateInvitationController, registerController } from '../controllers/auth.controller.js';


const router = Router();

router.post('/login', loginController);
router.post('/invitations', invitationController);
router.get('/invitations/validate', validateInvitationController);
router.post('/register', registerController)

export default router;