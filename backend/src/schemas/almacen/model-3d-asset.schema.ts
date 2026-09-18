import z from 'zod';

// GET .../model-3d-assets/:assetId/content — SIEMPRE anidado bajo un
// proyecto (aunque el asset en sí no le pertenezca a ninguno), porque
// la visibilidad de CADA pedido depende de "¿desde qué proyecto se
// está mirando esto?" (ver model-3d-asset.service.ts, VISIBILITY_CLAUSE).
export const ProjectModel3DAssetIdParamSchema = z.object({
    projectId: z.coerce.number(),
    assetId: z.coerce.number(),
});
export type ProjectModel3DAssetIdParam = z.infer<typeof ProjectModel3DAssetIdParamSchema>;
