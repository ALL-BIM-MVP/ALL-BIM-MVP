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

// PATCH /:projectId/members/:memberId/admin
export const SetMemberAdminSchema = z.object({
    is_admin : z.boolean()
});
export type SetMemberAdminData = z.infer<typeof SetMemberAdminSchema>;

// PUT /:projectId/members/:memberId/modules/:moduleCode/role
export const ProjectMemberModuleParamSchema = ProjectMemberIdParamSchema.extend({
    moduleCode : z.string().min(1)
});
export type ProjectMemberModuleParam = z.infer<typeof ProjectMemberModuleParamSchema>;

export const SetMemberModuleRoleSchema = z.object({
    module_role_id : z.coerce.number()
});
export type SetMemberModuleRoleData = z.infer<typeof SetMemberModuleRoleSchema>;
