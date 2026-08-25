# test_geometria.py
#
# Tests de regresión para geometria_proyeccion.calcular_volumen_malla —
# bug real encontrado y arreglado el 2026-08-24 (ver
# docs/roadmap/consolidacion-y-hardening.md, punto 11). Correr con:
#   python -m unittest processing.tests.test_geometria
# (desde la raíz del repo — el módulo se importa como processing.ifc.*,
# igual que hace cli.py).
import unittest

from processing.ifc.geometria_proyeccion import calcular_volumen_malla

# Un prisma rectangular simple: 2 x 3 x 4 = 24 m³. 8 vértices, 12
# triángulos (2 por cara), ganado consistente hacia afuera — mismo
# caso sintético que se usó en vivo para verificar el fix antes de
# aplicarlo.
_CUBO_VERTS = [
    (0, 0, 0), (2, 0, 0), (2, 3, 0), (0, 3, 0),
    (0, 0, 4), (2, 0, 4), (2, 3, 4), (0, 3, 4),
]
_CUBO_TRIS = [
    (0, 2, 1), (0, 3, 2),  # abajo (z=0)
    (4, 5, 6), (4, 6, 7),  # arriba (z=4)
    (0, 1, 5), (0, 5, 4),  # frente (y=0)
    (3, 7, 6), (3, 6, 2),  # atrás (y=3)
    (0, 4, 7), (0, 7, 3),  # izquierda (x=0)
    (1, 2, 6), (1, 6, 5),  # derecha (x=2)
]


class TestCalcularVolumenMalla(unittest.TestCase):

    def test_cubo_en_el_origen(self):
        self.assertAlmostEqual(calcular_volumen_malla(_CUBO_VERTS, _CUBO_TRIS), 24.0, places=6)

    def test_cubo_con_offset_no_es_prueba_suficiente(self):
        """OJO, dejado a propósito como advertencia: un cubo sintético
        con números redondos + un offset grande NO reproduce el bug
        real de forma confiable — la cancelación catastrófica de punto
        flotante depende de los bits exactos involucrados, no solo de
        la magnitud del offset (confirmado probando esto mismo: con
        este cubo el error termina siendo ~0.00008%, invisible, aunque
        el offset es del mismo orden que el de los casos reales que sí
        fallaban fuerte). Por eso el test que realmente importa
        (test_columna_real_con_bug_de_precision, abajo) usa vértices
        de un elemento REAL, no inventados."""
        offset = (177315.75, 8502481.89, 3400.87)
        verts_offset = [(x + offset[0], y + offset[1], z + offset[2]) for x, y, z in _CUBO_VERTS]
        resultado = calcular_volumen_malla(verts_offset, _CUBO_TRIS)
        self.assertAlmostEqual(resultado, 24.0, places=3)

    def test_columna_real_con_bug_de_precision(self):
        """Bug real (RESUELTO el 2026-08-24): vértices REALES de una
        columna del archivo del cliente (id=1566, perfil 0.5x0.5m,
        depth=4.69m según la definición IFC — volumen real conocido:
        0.5*0.5*4.69 = 1.1725 m³). Con la fórmula vieja (sin recentrar,
        coordenadas UTM ~10^7 directas) esto medía 0.8108 — confirmado
        que ES un repro fiel: si alguien vuelve a romper el recentrado,
        este test SÍ lo detecta (a diferencia del cubo sintético de
        arriba)."""
        vertices = [
            (177315.6241541309, 8502482.217514388, 3398.53),
            (177315.6241541309, 8502482.217514388, 3403.2200000000016),
            (177315.43007190514, 8502481.756719327, 3403.2200000000016),
            (177315.43007190514, 8502481.756719327, 3398.53),
            (177315.89086696765, 8502481.5626371, 3403.2200000000016),
            (177315.89086696765, 8502481.5626371, 3398.53),
            (177316.0849491934, 8502482.023432162, 3403.2200000000016),
            (177316.0849491934, 8502482.023432162, 3398.53),
        ]
        triangles = [
            (1, 0, 3), (2, 1, 3), (2, 3, 5), (4, 2, 5), (4, 5, 7), (6, 4, 7),
            (6, 7, 0), (1, 6, 0), (3, 0, 5), (0, 7, 5), (4, 1, 2), (4, 6, 1),
        ]
        resultado = calcular_volumen_malla(vertices, triangles)
        self.assertAlmostEqual(resultado, 1.1725, places=3)

    def test_lista_vacia_no_rompe(self):
        self.assertEqual(calcular_volumen_malla([], []), 0.0)


if __name__ == "__main__":
    unittest.main()
