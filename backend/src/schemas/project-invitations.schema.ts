import z from 'zod';
import { ProjectIdParamSchema } from './projects.schema.js';

export const InvitationStatusSchema = z.enum(['aceptado', 'rechazado', 'cancelado']);

export type RespondToTheInvitation = z.infer<typeof InvitationStatusSchema>;

export const updateStatusSchema = z.object({
    status : InvitationStatusSchema
});

export type updateStatusData = z.infer<typeof updateStatusSchema>;

// Un rol de módulo por invitación puntual (module_code + module_role_id,
// ambos del catálogo — ver GET /modules/:code/roles). Módulos que no
// aparecen acá quedan en el mínimo por defecto ("solo ver") cuando se
// acepte, mismo criterio que un miembro sin fila en
// project_member_module_roles.
export const InvitationModuleRoleInputSchema = z.object({
    module_code: z.string().min(1),
    module_role_id: z.coerce.number(),
});

// is_admin=true -> acceso total, no tiene sentido mandar module_roles
// (se rechaza si viene no-vacío, para no dejar ambigüedad sobre cuál
// de los dos manda). is_admin=false -> module_roles es la lista de
// asignaciones puntuales, puede venir vacía (todo en el mínimo por
// defecto).
export const DataForInvitationSchema = z.object({
    email : z.email(),
    is_admin: z.boolean().default(false),
    module_roles: z.array(InvitationModuleRoleInputSchema).default([]),
}).refine(
    (data) => !data.is_admin || data.module_roles.length === 0,
    { message: "Si is_admin es true, no se puede mandar module_roles.", path: ["module_roles"] }
);

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
