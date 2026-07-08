import { Router } from 'express';
import { getAllRolesController } from '../controllers/roles.controller.js';


const router = Router();

router.get('/', getAllRolesController);

export default router;