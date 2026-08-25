# Tests — `processing/ifc/`

Tests de regresión para los bugs de geometría/unidad encontrados y
arreglados el 2026-08-24 (ver `docs/roadmap/consolidacion-y-hardening.md`,
puntos 10 y 11). Usan `unittest` (viene con Python, no hace falta
instalar nada).

## Correr

Desde la raíz del repo:

```bash
# todos
python -m unittest discover -s processing/tests -t .

# uno solo
python -m unittest processing.tests.test_geometria
```

(con el venv del proyecto: `processing/.venv/bin/python -m unittest ...`)

## Qué hay acá

- `test_geometria.py` — `calcular_volumen_malla` (cancelación de punto
  flotante con coordenadas UTM).
- `test_dimensiones_orientadas.py` — `extraer_dimensiones_orientadas`
  (autovectores rotos del solver de Jacobi casero, reemplazado por
  `numpy.linalg.eigh`).
- `test_normalizar_unidad.py` — `normalizar_unidad` (superíndices
  unicode, m²/m³).

## Una lección real de cuando se armaron (no la ignores si agregás más)

El primer intento de test para `calcular_volumen_malla` usaba un cubo
inventado (números redondos) con un offset del mismo ORDEN DE MAGNITUD
que las coordenadas UTM reales — y **no detectaba el bug** al
reintroducirlo a propósito para probar el test (daba un error de
~0.00008%, invisible). La cancelación catastrófica de punto flotante
depende de los bits exactos involucrados, no solo de la magnitud del
número — un caso "parecido" no alcanza. El test que sí lo detecta usa
los vértices REALES de una columna real del archivo del cliente
(`test_columna_real_con_bug_de_precision`).

**Moraleja para tests de geometría/precisión numérica de acá en
adelante: preferir datos reales (o al menos vértices reales de algún
elemento, aunque el número no importe) sobre construir un caso
sintético "representativo" — lo sintético puede mentir.**
