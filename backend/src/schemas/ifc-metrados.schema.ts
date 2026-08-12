import z from 'zod';
import { optionalBooleanFlag } from './file.schema.js';

export const IfcFileIdParamSchema = z.object({
    ifcFileId: z.coerce.number(),
});

export type IfcFileIdParam = z.infer<typeof IfcFileIdParamSchema>;

// Variante JSON de POST /:projectId/ifc-metrados/process — "archivo ya
// guardado" (en vez de multipart con un archivo nuevo). Si vino un
// archivo por multipart, este body no se usa (el controller decide).
export const ProcessIfcMetradosBodySchema = z.object({
    file_id: z.coerce.number().optional(),
});

export type ProcessIfcMetradosBody = z.infer<typeof ProcessIfcMetradosBodySchema>;

export const ProcessIfcMetradosQuerySchema = z.object({
    force: optionalBooleanFlag,
});

export type ProcessIfcMetradosQuery = z.infer<typeof ProcessIfcMetradosQuerySchema>;
