import type { Request, Response, NextFunction } from "express";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { AppError } from "../models/errors/app-error.js";

export const errorHandler = ( err: unknown, req: Request, res: Response, next: NextFunction ): void => {

    if (err instanceof AppError) {
        res.status(err.statusCode).json(err.response);
        return;
    }

    console.error(err);

    res.status(COMMON_ERRORS.INTERNAL_SERVER_ERROR.statusCode)
        .json(COMMON_ERRORS.INTERNAL_SERVER_ERROR.response);
};