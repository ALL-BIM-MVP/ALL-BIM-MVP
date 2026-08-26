import { Router } from 'express';
import { loginController, refreshSessionController, logoutController } from '../controllers/auth.controller.js';
import { loginRateLimiter } from '../middlewares/rate-limit.middleware.js';

const router = Router();

router.post('/login', loginRateLimiter, loginController);
router.post('/refresh', refreshSessionController);
router.post('/logout', logoutController);

export default router;