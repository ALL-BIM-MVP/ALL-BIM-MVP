import z from 'zod';

export const GetUsersSchema = z.object({
    sort: z.enum(["name", "email", "created_at"]).default("created_at"),
    active: z.enum(["true", "false"]).transform( v => v === "true").optional(),
    order: z.enum(["asc", "desc"]).default("asc"),
    // Por defecto el listado excluye las cuentas eliminadas (is_deleted)
    // — mismo criterio que las imágenes "sin clasificación" en processing,
    // el caso normal no las quiere ver. Solo se muestran si se piden
    // explícito.
    include_deleted: z.enum(["true", "false"]).transform( v => v === "true").default(false),
});
export type GetUsersQuery = z.infer<typeof GetUsersSchema>;

// PATCH /users/me — al menos un campo, si no no hay nada que actualizar
// (mismo criterio que NO_FIELDS_TO_UPDATE en projects.schema.ts).
export const UpdateMeSchema = z.object({
    name: z.string().min(1).optional(),
    last_name: z.string().min(1).nullable().optional(),
}).refine(
    (data) => data.name !== undefined || data.last_name !== undefined,
    { message: "Hay que mandar al menos un campo para actualizar." }
);
export type UpdateMeRequest = z.infer<typeof UpdateMeSchema>;

// :userId de las rutas de administración (activar/desactivar/eliminar
// a OTRO usuario) — separado de requireOwner (que compara contra
// req.params.id, no :userId, y no aplica acá porque estas rutas son
// justo para actuar sobre alguien que NO es uno mismo).
export const UserIdParamSchema = z.object({
    userId: z.coerce.number(),
});
export type UserIdParam = z.infer<typeof UserIdParamSchema>;

// PATCH /users/:userId/active — activar o desactivar. Body explícito
// (no un toggle implícito) para que la request diga con claridad qué
// estado se está pidiendo, sin depender de adivinar el estado actual.
export const SetUserActiveSchema = z.object({
    active: z.boolean(),
});
export type SetUserActiveRequest = z.infer<typeof SetUserActiveSchema>;
