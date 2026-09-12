import z from 'zod';

export const SearchLocationQuerySchema = z.object({
    q: z.string().trim().min(1, "Hace falta un texto para buscar"),
});
export type SearchLocationQuery = z.infer<typeof SearchLocationQuerySchema>;
