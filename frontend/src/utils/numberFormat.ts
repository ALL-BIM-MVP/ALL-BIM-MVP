// Los NUMERIC del backend (cantidades, precios, totales) viajan como texto con hasta 6 decimales
// fijos ("2.000000", "50.000000") — se ven mal en pantalla. Esto los deja como espera el usuario:
// sin decimales de sobra cuando el valor es entero ("2"), y con los decimales que de verdad tiene
// cuando no lo es ("2.5"), nunca ceros de relleno.
export function trimNumeric(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (Number.isNaN(n)) return String(value);
  return String(n);
}
