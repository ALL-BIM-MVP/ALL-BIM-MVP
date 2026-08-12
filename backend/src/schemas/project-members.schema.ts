import z from 'zod';
import { ProjectIdParamSchema } from './projects.schema.js';

export const ProjectMemberIdParamSchema = ProjectIdParamSchema.extend({
    memberId : z.coerce.number()
});

export type ProjectMemberIdParam = z.infer<typeof ProjectMemberIdParamSchema>;

export const ProjectMemberUserParamSchema = ProjectIdParamSchema.extend({
    userId : z.coerce.number()
});

export type ProjectMemberUserParam = z.infer<typeof ProjectMemberUserParamSchema>;

export const UpdateProjectMemberRoleSchema = z.object({
    project_role_id : z.coerce.number()
});

export type UpdateProjectMemberRoleData = z.infer<typeof UpdateProjectMemberRoleSchema>;
