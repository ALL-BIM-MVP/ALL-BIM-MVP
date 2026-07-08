import 'express';
import type { DecodedToken } from '../models/auth.models.ts';

declare module "express-serve-static-core" {
  interface Request {
    user?: DecodedToken;
  }
}