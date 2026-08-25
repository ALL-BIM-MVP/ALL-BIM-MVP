# test_dimensiones_orientadas.py
#
# Test de regresión para extraction.extraer_dimensiones_orientadas
# (OBB 3D vía PCA) — bug real encontrado y arreglado el 2026-08-24: el
# solver de Jacobi escrito a mano devolvía autovectores con los
# componentes X/Y intercambiados entre el eje 1 y el eje 2 para
# algunos elementos (no un error de precisión, un eje completamente
# distinto) — reemplazado por numpy.linalg.eigh (LAPACK, probado). Ver
# docs/roadmap/consolidacion-y-hardening.md, punto 11.
#
# Correr con: python -m unittest processing.tests.test_dimensiones_orientadas
import unittest

from processing.ifc.extraction import extraer_dimensiones_orientadas


class _FakeGeometry:
    def __init__(self, verts_flat):
        self.verts = verts_flat
        self.faces = []  # extraer_dimensiones_orientadas no usa .faces, solo .verts


class _FakeShape:
    def __init__(self, verts_flat):
        self.geometry = _FakeGeometry(verts_flat)


def _shape_de(vertices):
    return _FakeShape([coord for v in vertices for coord in v])


# Los 8 vértices REALES (coordenadas de mundo, UTM) de un elemento real
# del archivo del cliente — una tira de fibra de carbono FRP de 50mm
# (nombre real del elemento en el IFC:
# "CSRT_FibraDeCarbono_FRP:FibraDeCarbono_FRP_50mm:3133742"). Las
# aristas reales, calculadas a mano a partir de estos mismos vértices,
# son ~4.85m (largo) x ~0.05m (ancho) x 0.01m (espesor) — con el bug
# viejo, esta función devolvía Largo=3.50/Ancho=3.42, un rectángulo
# que no correspondía a NINGÚN lado real del elemento (el caso que
# disparó toda la investigación del punto 11).
_FRP_STRIP_VERTS = [
    (177325.9334295895, 8502495.101066764, 3403.0400000000004),
    (177325.9334295895, 8502495.101066764, 3403.0500000000006),
    (177330.40314169598, 8502493.218469175, 3403.0500000000006),
    (177330.40314169598, 8502493.218469175, 3403.0400000000004),
    (177330.42254991853, 8502493.264548682, 3403.0500000000006),
    (177330.42254991853, 8502493.264548682, 3403.0400000000004),
    (177325.95283781204, 8502495.147146272, 3403.0500000000006),
    (177325.95283781204, 8502495.147146272, 3403.0400000000004),
]


class TestExtraerDimensionesOrientadas(unittest.TestCase):

    def test_tira_fibra_de_carbono_real(self):
        shape = _shape_de(_FRP_STRIP_VERTS)
        dims = extraer_dimensiones_orientadas(None, shape)
        self.assertAlmostEqual(dims["Largo"], 4.85, places=1)
        self.assertAlmostEqual(dims["Ancho"], 0.05, places=2)
        self.assertAlmostEqual(dims["Alto"], 0.01, places=2)

    def test_cubo_con_coordenadas_de_mundo_reales(self):
        """Sanity check aparte, con una forma más simple (cubo 2x3x4,
        offset UTM real) — Alto tiene que ser 4 (el eje más alineado a
        Z), y Largo/Ancho los otros dos (3 y 2, en cualquier orden
        entre sí ya que la función asigna 'largo' al más grande)."""
        base = [
            (0, 0, 0), (2, 0, 0), (2, 3, 0), (0, 3, 0),
            (0, 0, 4), (2, 0, 4), (2, 3, 4), (0, 3, 4),
        ]
        offset = (177315.75, 8502481.89, 3400.87)
        vertices = [(x + offset[0], y + offset[1], z + offset[2]) for x, y, z in base]
        dims = extraer_dimensiones_orientadas(None, _shape_de(vertices))
        self.assertAlmostEqual(dims["Alto"], 4.0, places=3)
        self.assertAlmostEqual(dims["Largo"], 3.0, places=3)
        self.assertAlmostEqual(dims["Ancho"], 2.0, places=3)


if __name__ == "__main__":
    unittest.main()
