import jwt from 'jsonwebtoken';
import type { Request, Response} from 'express';

export const requireAuth = (req : Request, res : Response, next : Function) => {
    
};