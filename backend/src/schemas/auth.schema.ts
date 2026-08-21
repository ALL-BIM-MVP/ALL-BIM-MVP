import z from 'zod'

export const LoginSchema = z.object({
    email: z.email(),
    password: z.string()
});
export type LoginRequest = z.infer<typeof LoginSchema>;


export const InvitationSchema = z.object({
    role_id: z.coerce.number(),
    email: z.email()
});
export type InvitationRequest = z.infer<typeof InvitationSchema>;

export const RegisterSchema = z.object({
    name: z.string(),
    // Opcional a propósito: se agrega el campo (ver users.last_name)
    // sin volver el registro más restrictivo de lo que ya era.
    last_name: z.string().min(1).optional(),
    password: z.string(),
    token : z.uuid(),
});

export type RegisterRequest = z.infer<typeof RegisterSchema>;

export const TokenSchema = z.object({
    token: z.uuid()
});

// GET /invitations (historial) — limit opcional a pedido del cliente,
// siempre acotado a un techo server-side (ver DEFAULT/MAX_INVITATIONS_LIMIT
// en user-invitations.service.ts) para no permitir pedir la tabla entera.
export const GetUserInvitationsQuerySchema = z.object({
    limit: z.coerce.number().int().positive().optional(),
});
export type GetUserInvitationsQuery = z.infer<typeof GetUserInvitationsQuerySchema>;

