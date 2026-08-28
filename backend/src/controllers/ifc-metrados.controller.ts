import fs from "node:fs/promises";
import { AppError } from "../models/errors/app-error.js";
import { AUTH_ERRORS } from "../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../models/errors/common.errors.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ProjectIdParamSchema } from "../schemas/projects.schema.js";
import {
    ClassificationDryRunBodySchema,
    IfcFileIdParamSchema,
    ProcessIfcMetradosBodySchema,
    ProcessIfcMetradosQuerySchema,
} from "../schemas/ifc-metrados.schema.js";
import {
    classificationDryRunService, getIfcFileStatusService, processIfcMetradosService,
} from "../services/ifc-metrados.service.js";
import type { ClassificationDryRunResult } from "../services/ifc-metrados.service.js";
import type { IfcFileStatusWithFragments } from "../models/ifc-files.models.js";
import type { Request, Response } from "express";

export const processIfcMetradosController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectIdParamSchema.safeParse(req.params);

        if (!params.success) {
            if (req.file) await fs.rm(req.file.path, { force: true });
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const query = ProcessIfcMetradosQuerySchema.safeParse(req.query);
        const body = ProcessIfcMetradosBodySchema.safeParse(req.body ?? {});

        if (!query.success || !body.success) {
            if (req.file) await fs.rm(req.file.path, { force: true });
            throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
        }

        const { status, justStarted } = await processIfcMetradosService(
            req.user, params.data, body.data, req.file, query.data
        );

        res.status(justStarted ? 202 : 200).json(status);
});

export const classificationDryRunController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = ProjectIdParamSchema.safeParse(req.params);

        if (!params.success) {
            if (req.file) await fs.rm(req.file.path, { force: true });
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const body = ClassificationDryRunBodySchema.safeParse(req.body ?? {});

        if (!body.success) {
            if (req.file) await fs.rm(req.file.path, { force: true });
            throw new AppError(COMMON_ERRORS.INVALID_REQUEST_DATA);
        }

        const resultado : ClassificationDryRunResult = await classificationDryRunService(
            req.user, params.data, body.data, req.file
        );

        res.status(200).json(resultado);
});

export const getIfcFileStatusController = asyncHandler (
    async (req : Request, res : Response) : Promise<void> =>{

        if (!req.user) {
            throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
        }

        const params = IfcFileIdParamSchema.safeParse(req.params);

        if (!params.success) {
            throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);
        }

        const status : IfcFileStatusWithFragments = await getIfcFileStatusService(req.user, params.data);

        res.status(200).json(status);
});
