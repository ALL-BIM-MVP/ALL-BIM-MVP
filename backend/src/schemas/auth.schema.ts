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
    email: z.email(),
    password: z.string(),
    role: z.string(),
});
export type RegisterRequest = z.infer<typeof RegisterSchema>;

export const TokenSchema = z.object({
    token: z.uuid()
});

