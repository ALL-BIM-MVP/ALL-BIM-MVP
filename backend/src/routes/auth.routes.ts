import { Router } from 'express';
import { invitationController, loginController, 
    validateInvitationController, registerController, 
    refreshSessionController, logoutController, 
    getMeController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';


const router = Router();

router.post('/login', loginController);
router.post('/invitations', invitationController);
router.get('/invitations/validate', validateInvitationController);
router.post('/register', registerController);

router.post('/refresh', refreshSessionController);
router.post('/logout', logoutController);
router.get('/me', requireAuth, getMeController);


export default router;