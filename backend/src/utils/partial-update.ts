// Arma "col = $n, ..." solo con las columnas presentes en el body de un PATCH.
// Las columnas salen de la lista fija que pasa cada servicio (nunca de las
// claves del usuario); los valores van parametrizados desde `firstParam`.
export const buildSet = (
    columns: readonly string[], body: Record<string, unknown>, firstParam: number
): { set: string; values: unknown[] } => {
    const sent = columns.filter((column) => body[column] !== undefined);
    return {
        set: sent.map((column, index) => `${column} = $${firstParam + index}`).join(", "),
        values: sent.map((column) => body[column]),
    };
};
