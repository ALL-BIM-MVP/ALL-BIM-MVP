import { Router } from 'express';
import { loginController, refreshSessionController, logoutController } from '../controllers/auth.controller.js';

const router = Router();

router.post('/login', loginController);
router.post('/refresh', refreshSessionController);
router.post('/logout', logoutController);

export default router;