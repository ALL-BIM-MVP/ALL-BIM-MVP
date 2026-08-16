import 'express';
import type { DecodedToken } from '../models/auth.models.ts';
import type { SignedFilePurpose } from '../utils/file-signing.ts';

declare module "express-serve-static-core" {
  interface Request {
    user?: DecodedToken;
    // Presente cuando el acceso a /files/:id/content|thumbnail vino
    // autorizado por un ?token= firmado (ver
    // middlewares/file-access.middleware.ts) en vez de un Bearer normal
    // — en ese camino req.user queda undefined a propósito, no hizo
    // falta decodificar un JWT de sesión para autorizar este request.
    fileAccessGrant?: { file_id: string; purpose: SignedFilePurpose };
  }
}