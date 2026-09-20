import type { Request, Response, NextFunction } from "express";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { AppError } from "../models/errors/app-error.js";
import { logger } from "../utils/logger.js";

export const errorHandler = ( err: unknown, req: Request, res: Response, next: NextFunction ): void => {

    if (res.headersSent) {
        next(err);
        return;
    }

    if (err instanceof AppError) {
        res.status(err.statusCode).json(err.response);
        return;
    }

    // Errores de express.json() (body-parser): son culpa del cliente, no del
    // servidor. Sin esto un JSON mal formado terminaba como un 500 opaco.
    const bodyParserType = (err as { type?: string } | null)?.type;
    if (bodyParserType === "entity.parse.failed") {
        res.status(COMMON_ERRORS.INVALID_JSON_BODY.statusCode).json(COMMON_ERRORS.INVALID_JSON_BODY.response);
        return;
    }
    if (bodyParserType === "entity.too.large") {
        res.status(COMMON_ERRORS.PAYLOAD_TOO_LARGE.statusCode).json(COMMON_ERRORS.PAYLOAD_TOO_LARGE.response);
        return;
    }

    // Excepción NO atrapada por ningún AppError explícito — el único
    // lugar donde algo así se entera de que pasó es acá, ahora en JSON
    // estructurado (docker compose logs backend) en vez de texto
    // libre. AppError (arriba) nunca llega hasta acá — esos son
    // errores esperados/manejados, no ameritan nivel 'error'.
    logger.error({ err, method: req.method, url: req.originalUrl }, "Excepción no atrapada");

    res.status(COMMON_ERRORS.INTERNAL_SERVER_ERROR.statusCode)
        .json(COMMON_ERRORS.INTERNAL_SERVER_ERROR.response);
};