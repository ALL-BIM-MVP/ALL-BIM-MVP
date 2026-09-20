// Resumen del producto que se incrusta en las respuestas de Almacén (documentos,
// ingresos, vales, Kardex, hoja de vida…). Es un solo lugar para que todas
// muestren lo mismo: `display_id` es el ID que ve el usuario (ver
// categories.next_display_id), `code` el código de obra.
export const productSummarySql = (alias: string): string =>
    `json_build_object('product_id', ${alias}.product_id::text, 'category_id', ${alias}.category_id, 'code', ${alias}.code, ` +
    `'display_id', ${alias}.display_id, 'name', ${alias}.name, 'unit', ${alias}.unit)`;
