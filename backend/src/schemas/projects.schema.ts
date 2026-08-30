import z from 'zod';

export const ProjectCoreSchema = z.object({
    name: z.string().min(1, "El nombre no puede estar vacío"),
});

export const ProjectCreateSchema = ProjectCoreSchema.extend({
    description: z.string().nullable(),
    location: z.string().nullable(),
    client: z.string().nullable(),
    contractor: z.string().nullable(),
    start_date: z.coerce.date().nullable(),
    end_date: z.coerce.date().nullable(),
});

export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;

export const ProjectUpdateSchema = ProjectCreateSchema.partial();

export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;

// "all" (todos los proyectos de la plataforma) se sacó — el rol de
// cuenta ADMINISTRADOR no da acceso al CONTENIDO de un proyecto ajeno
// igual (ver project-access.service.ts), así que listarlos ahí era
// solo ruido, nunca algo navegable de verdad. Mismos 3 scopes para
// cualquier rol.
export const GetProjectsSchema = z.object({
    scope: z.enum(["mine", "owner", "member"]).default("mine")
});

export type GetProjectsQuery = z.infer<typeof GetProjectsSchema>;

export const ProjectIdParamSchema = z.object({
    projectId : z.coerce.number()
});

export type ProjectIdParam = z.infer<typeof ProjectIdParamSchema>;

