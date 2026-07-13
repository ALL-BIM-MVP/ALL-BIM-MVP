import z from 'zod';

export const ProjectRoleCreateSchema = z.object({
    name: z.string().min(1, "El nombre no puede estar vacío"),
});

export type ProjectRoleData = z.infer<typeof ProjectRoleCreateSchema>;

export const GetProjectRolesSchema = z.object({
    scope: z.enum(["all", "owner", "default"]).default("all")
});

export type GetProjectRolesQuery = z.infer<typeof GetProjectRolesSchema>;

export const ProjectRoleIdParamSchema = z.object({
    projectRoleId : z.coerce.number()
});

export type ProjectRoleIdParam = z.infer<typeof ProjectRoleIdParamSchema>;

