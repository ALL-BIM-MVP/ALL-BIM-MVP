import z from 'zod';

export const BuscarUbicacionQuerySchema = z.object({
    q: z.string().trim().min(1, "Hace falta un texto para buscar"),
});
export type BuscarUbicacionQuery = z.infer<typeof BuscarUbicacionQuerySchema>;
