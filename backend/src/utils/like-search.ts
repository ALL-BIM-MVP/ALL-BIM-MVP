// Patrón para `ILIKE` a partir de lo que escribe el usuario: los comodines de
// LIKE (% _ \) se escapan para buscarlos tal cual, y se busca "contiene".
export const containsPattern = (search: string): string => `%${search.replace(/[\\%_]/g, "\\$&")}%`;
