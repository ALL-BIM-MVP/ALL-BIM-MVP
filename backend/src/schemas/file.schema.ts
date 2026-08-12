import z from 'zod';

export const FILE_TYPES = ["ifc", "excel", "pdf", "txt", "image", "other"] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const saveFileBodySchema = z.object({
    file_type: z.enum(FILE_TYPES).optional(),
});

export type SaveFileBody = z.infer<typeof saveFileBodySchema>;

export const FileIdParamSchema = z.object({
    fileId: z.coerce.number(),
});

export type FileIdParam = z.infer<typeof FileIdParamSchema>;

// Exportado: ifc-metrados.schema.ts reusa el mismo patrón para `force`.
export const optionalBooleanFlag = z.enum(["true", "false"])
    .optional()
    .transform((value) => value === undefined ? undefined : value === "true");

export const GetProjectFilesQuerySchema = z.object({
    file_type: z.enum(FILE_TYPES).optional(),
    processed: optionalBooleanFlag,
});

export type GetProjectFilesQuery = z.infer<typeof GetProjectFilesQuerySchema>;

export const FileContentQuerySchema = z.object({
    download: optionalBooleanFlag,
});

export type FileContentQuery = z.infer<typeof FileContentQuerySchema>;
