import type { Request, Response } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../models/errors/app-error.js";
import { AUTH_ERRORS } from "../../models/errors/auth.errors.js";
import { COMMON_ERRORS } from "../../models/errors/common.errors.js";
import { MODEL_3D_ASSET_ERRORS } from "../../models/errors/almacen/model-3d-asset.errors.js";
import { ProjectIdParamSchema } from "../../schemas/projects.schema.js";
import { ProjectModel3DAssetIdParamSchema } from "../../schemas/almacen/model-3d-asset.schema.js";
import {
    getModel3DAssetContentService, listModel3DAssetsService, uploadModel3DAssetService,
} from "../../services/almacen/model-3d-asset.service.js";

// POST /api/model-3d-assets — SIN proyecto en la URL a propósito: sube
// a la biblioteca personal del usuario, no depende de ningún proyecto
// (ver model-3d-asset.service.ts). Asignarlo a un producto es un paso
// aparte (PUT .../products/:id/model-3d, ver product.controller.ts).
export const uploadModel3DAssetController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);
    if (!req.file) throw new AppError(MODEL_3D_ASSET_ERRORS.MODEL_3D_ASSET_FILE_REQUIRED);

    res.status(201).json(await uploadModel3DAssetService(req.user, req.file));
});

export const listModel3DAssetsController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    res.status(200).json(await listModel3DAssetsService(req.user, params.data));
});

export const getModel3DAssetContentController = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw new AppError(AUTH_ERRORS.IDENTITY_NOT_VERIFIED);

    const params = ProjectModel3DAssetIdParamSchema.safeParse(req.params);
    if (!params.success) throw new AppError(COMMON_ERRORS.INVALID_ID_PARAM);

    const { absolutePath, format } = await getModel3DAssetContentService(req.user, params.data.projectId, params.data.assetId);

    const contentTypes: Record<"glb" | "gltf", string> = { glb: "model/gltf-binary", gltf: "model/gltf+json" };
    res.type(contentTypes[format]);
    await new Promise<void>((resolve, reject) => {
        res.sendFile(absolutePath, (err) => err ? reject(err) : resolve());
    });
});
