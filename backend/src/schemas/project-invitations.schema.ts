import z from 'zod';
import { ProjectIdParamSchema } from './projects.schema.js';

export const InvitationStatusSchema = z.enum(['aceptado', 'rechazado', 'cancelado']);

export type RespondToTheInvitation = z.infer<typeof InvitationStatusSchema>;

export const updateStatusSchema = z.object({
    status : InvitationStatusSchema
});

export type updateStatusData = z.infer<typeof updateStatusSchema>;

export const DataForInvitationSchema = z.object({
    email : z.email(),
    project_role_id : z.coerce.number()
});

export type InviteToProjectData = z.infer<typeof DataForInvitationSchema>;

export const ProjectInvitationsParamsSchema = ProjectIdParamSchema.extend({
    invitationId : z.coerce.number()
});

export type ProjectInvitationParams = z.infer<typeof ProjectInvitationsParamsSchema>;

export const MeInvitationsQuerySchema = z.object({
    filter : z.enum(['pending', 'all', 'completed'])
});

export type MeInvitationsQuery = z.infer<typeof MeInvitationsQuerySchema>; 

export const SearchUsersQuerySchema = z.object({
    attribute: z.enum(['name','email']),
    value: z.string().min(1, { message: "El parámetro de búsqueda es requerido" })
});

export type SearchUserQuery = z.infer<typeof SearchUsersQuerySchema>;