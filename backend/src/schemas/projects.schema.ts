import z from 'zod';

export const ProjectCoreSchema = z.object({
    name: z.string().min(1, "El nombre no puede estar vacío"),
});

export const ProjectCreateSchema = ProjectCoreSchema.extend({
    description: z.string().nullable(),
    location: z.string().nullable(),
    start_date: z.coerce.date().nullable(),
    end_date: z.coerce.date().nullable(),
});

export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;

export const ProjectUpdateSchema = ProjectCreateSchema.partial();

export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;

export const GetProjectsSchema = z.object({
    scope: z.enum(["mine", "owner", "member", "all"]).default("mine")
});

export type GetProjectsQuery = z.infer<typeof GetProjectsSchema>;

export const ProjectIdParamSchema = z.object({
    projectId : z.coerce.number()
});

export type ProjectIdParam = z.infer<typeof ProjectIdParamSchema>;

