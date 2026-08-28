import z from 'zod';

export const FILE_TYPES = ["ifc", "excel", "pdf", "txt", "image", "other", "fragments"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const saveFileBodySchema = z.object({
    file_type: z.enum(FILE_TYPES).optional(),
});

export type SaveFileBody = z.infer<typeof saveFileBodySchema>;

export const FileIdParamSchema = z.object({
    fileId: z.coerce.number(),
});

export type FileIdParam = z.infer<typeof FileIdParamSchema>;

// Para DELETE /projects/:projectId/files/:fileId — a diferencia de
// FileIdParamSchema (usado por /files/:fileId/content, que no lleva
// projectId en la URL), este endpoint SÍ cuelga de /projects porque
// sigue el mismo patrón anidado que POST/GET de arriba.
export const ProjectFileIdParamSchema = z.object({
    projectId: z.coerce.number(),
    fileId: z.coerce.number(),
});

export type ProjectFileIdParam = z.infer<typeof ProjectFileIdParamSchema>;

// Exportado: ifc-metrados.schema.ts reusa el mismo patrón para `force`.
export const optionalBooleanFlag = z.enum(["true", "false"])
    .optional()
    .transform((value) => value === undefined ? undefined : value === "true");

export const GetProjectFilesQuerySchema = z.object({
    file_type: z.enum(FILE_TYPES).optional(),
    processed: optionalBooleanFlag,
    // Fase 3 (versionado de IFC) — sin este filtro, la lista trae TODAS
    // las versiones vivas de cada documento IFC (viejas incluidas, como
    // registro histórico). only_current=true la reduce a solo la
    // versión vigente de cada ifc_documents — no afecta archivos que no
    // son 'ifc' (is_current es null para esos, nunca se filtran).
    only_current: optionalBooleanFlag,
});

export type GetProjectFilesQuery = z.infer<typeof GetProjectFilesQuerySchema>;

export const FileContentQuerySchema = z.object({
    download: optionalBooleanFlag,
});

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;
