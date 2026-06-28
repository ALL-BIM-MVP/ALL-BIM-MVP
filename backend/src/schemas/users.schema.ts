import z from 'zod';

export const GetUsersSchema = z.object({
    sort: z.enum(["name", "email", "created_at"]).default("created_at"),
    active: z.enum(["true", "false"]).transform( v => v === "true").optional(),
    order: z.enum(["asc", "desc"]).default("asc")
});
export type GetUsersQuery = z.infer<typeof GetUsersSchema>;

