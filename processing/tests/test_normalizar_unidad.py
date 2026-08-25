# test_normalizar_unidad.py
#
# Test de regresión para extraction.normalizar_unidad — bug real
# encontrado y arreglado el 2026-08-24: la unidad de una partida en
# clasificación manual sale del texto que el cliente escribió a mano
# en Revit — si venía con superíndice unicode ("m²"/"m³") en vez de
# ASCII, ninguna comparación exacta del resto del pipeline la
# reconocía, y el total de la partida caía en silencio al fallback de
# contar elementos en vez de sumar área/volumen real. Ver
# docs/roadmap/consolidacion-y-hardening.md, punto 10.
#
# Correr con: python -m unittest processing.tests.test_normalizar_unidad
import unittest

from processing.ifc.extraction import normalizar_unidad


class TestNormalizarUnidad(unittest.TestCase):

    def test_superindices_unicode(self):
        self.assertEqual(normalizar_unidad("m²"), "m2")  # m²
        self.assertEqual(normalizar_unidad("m³"), "m3")  # m³

    def test_mayusculas(self):
        self.assertEqual(normalizar_unidad("M2"), "m2")

    def test_espacios(self):
        self.assertEqual(normalizar_unidad(" m3 "), "m3")

    def test_unidades_no_conocidas_pasan_igual(self):
        # NO es un vocabulario cerrado a propósito (ver comentario en
        # extraction.py) — "glb"/"pto" (unidades reales de la norma) y
        # cualquier otra que el cliente use tienen que seguir pasando
        # sin tocar, normalizar_unidad solo limpia formato.
        self.assertEqual(normalizar_unidad("glb"), "glb")
        self.assertEqual(normalizar_unidad("pto"), "pto")

    def test_none_pasa_none(self):
        self.assertIsNone(normalizar_unidad(None))


if __name__ == "__main__":
    unittest.main()
