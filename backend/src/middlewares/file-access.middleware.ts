import type { NextFunction, Request, Response } from "express";
import { requireAuth } from "./auth.middleware.js";
import { verifyFileAccess, type SignedFilePurpose } from "../utils/file-signing.js";
import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";

// Dos caminos para llegar a /files/:fileId/content|thumbnail, pensados
// para convivir igual que en S3 conviven las URLs presignadas y el
// acceso autenticado normal:
//
//   1) ?token=... firmado — para <img src="..."> o cualquier consumo
//      directo sin JS, sin Authorization header. Si viene, se exige
//      estricto: si no es válido para ESTE fileId y ESTE purpose, o
//      venció, 401 explícito — no degrada en silencio al paso 2 (un
//      <img> nunca manda Authorization, así que "probar con Bearer
//      después" nunca serviría igual).
//   2) Sin token -> el flujo de siempre, Authorization: Bearer
//      (requireAuth), para consumo programático/API.
export const authorizeFileAccess = (purpose : SignedFilePurpose) =>
    (req : Request, res : Response, next : NextFunction) : void => {
        const token = typeof req.query.token === "string" ? req.query.token : null;

        if (!token) {
            requireAuth(req, res, next);
            return;
        }

        const fileId = req.params.fileId;

        // Solo valida FORMATO acá (BIGINT sin signo) — la comparación
        // real contra lo firmado es siempre string===string dentro de
        // verifyFileAccess, nunca se castea a Number (ver comentario en
        // utils/file-signing.ts sobre por qué eso rompía la firma).
        if (typeof fileId !== "string" || !/^\d+$/.test(fileId)) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        if (!verifyFileAccess(token, fileId, purpose)) {
            throw new AppError(AUTH_ERRORS.SIGNED_URL_INVALID_OR_EXPIRED);
        }

        req.fileAccessGrant = { file_id: fileId, purpose };
        next();
    };
