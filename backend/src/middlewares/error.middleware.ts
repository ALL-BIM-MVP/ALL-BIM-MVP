import type { Request, Response, NextFunction } from "express";
import { AppError, ERRORS } from "../models/error.models.js";

export const errorHandler = ( err: unknown, req: Request, res: Response, next: NextFunction ): void => {

    if (err instanceof AppError) {
        res.status(err.statusCode).json(err.response);
        return;
    }

    console.error(err);

    res.status(ERRORS.INTERNAL_SERVER_ERROR.statusCode)
        .json(ERRORS.INTERNAL_SERVER_ERROR.response);
};